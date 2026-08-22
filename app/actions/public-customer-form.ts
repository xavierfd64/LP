"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifyStaff } from "@/lib/notifications";
import { resolvePublicCustomerForm, type PublicFormResult } from "@/lib/customer-form";

export async function getPublicCustomerFormAction(token: string): Promise<PublicFormResult> {
  return resolvePublicCustomerForm(token);
}

const itemRowSchema = z.object({
  name: z.string().min(1, "Please provide a name/label for every row."),
  qty: z.coerce.number().int().positive(),
  notes: z.string().optional(),
  specs: z.record(z.string(), z.string()).optional(),
});
const submitSchema = z.object({
  notes: z.string().max(1000).optional(),
  items: z.array(itemRowSchema).min(1, "Please add at least one item."),
});

function parseSubmission(formData: FormData) {
  let itemsRaw: unknown;
  try {
    itemsRaw = JSON.parse((formData.get("itemsJson") as string) || "[]");
  } catch {
    return { success: false as const, message: "Invalid item data." };
  }
  const parsed = submitSchema.safeParse({ notes: (formData.get("notes") as string) || undefined, items: itemsRaw });
  if (!parsed.success) return { success: false as const, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  return { success: true as const, data: parsed.data };
}

/**
 * Shared save path for both Draft and Submit (spec 3's "Save/Submit should
 * validate required fields") — replaces every NOT-YET-PRINTED item with the
 * customer's current rows (printed items are never touched here, matching
 * spec item 6's "printed-item protection must remain separate" even from
 * the form's own save/submit cycle) and preserves the form record itself
 * (never a second copy/version row — spec 12's "never silently overwrite"
 * is satisfied by only ever mutating while status is OPEN, guarded below).
 */
async function saveForm(token: string, formData: FormData, lock: boolean): Promise<string | undefined> {
  const result = await resolvePublicCustomerForm(token);
  if (!result.ok) return "This form link is no longer available.";
  const { form } = result;
  if (form.status !== "OPEN") return "This form has already been submitted and is locked.";

  const parsed = parseSubmission(formData);
  if (!parsed.success) return parsed.message;

  // Start new sortOrder values after every existing item (printed or not)
  // so a re-save never collides with a printed item's original position —
  // printed rows are excluded from the delete/recreate below but keep
  // whatever sortOrder they already had.
  const nextStartOrder = form.items.length > 0 ? Math.max(...form.items.map((i) => i.sortOrder)) + 1 : 0;

  await prisma.$transaction([
    prisma.customerFormItem.deleteMany({ where: { formId: form.id, printed: false } }),
    prisma.customerFormItem.createMany({
      data: parsed.data.items.map((it, i) => ({
        formId: form.id,
        sortOrder: nextStartOrder + i,
        name: it.name,
        qty: it.qty,
        notes: it.notes,
        specs: it.specs ?? {},
      })),
    }),
    prisma.customerForm.update({
      where: { id: form.id },
      data: {
        notes: parsed.data.notes,
        ...(lock ? { status: "SUBMITTED", submittedAt: new Date() } : {}),
      },
    }),
  ]);

  await logAudit(null, lock ? "FORM_SUBMITTED" : "FORM_SAVED_DRAFT", "CustomerForm", form.id, { itemCount: parsed.data.items.length });
  if (lock) {
    await logAudit(null, "FORM_LOCKED", "CustomerForm", form.id, {});
    await notifyStaff("FORM_SUBMITTED", `${form.customer.name} submitted their ${form.title} for ${form.jobOrder.joNumber}.`, `/forms/${form.id}`);
  }
  return undefined;
}

export async function saveCustomerFormDraftAction(token: string, _prevState: string | undefined, formData: FormData) {
  const error = await saveForm(token, formData, false);
  return error;
}

export async function submitCustomerFormAction(token: string, _prevState: string | undefined, formData: FormData) {
  const error = await saveForm(token, formData, true);
  return error;
}
