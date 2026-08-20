"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";

// Trimmed, non-blank, reasonably bounded — mirrors the Expense Category
// validation discipline from the 2nd update.
const supplierSchema = z.object({
  name: z.string().trim().min(2, "Supplier name is required.").max(120, "Supplier name is too long."),
  contactPerson: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(150).optional(),
  address: z.string().trim().max(300).optional(),
  taxId: z.string().trim().max(60).optional(),
  paymentTerms: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  active: z.enum(["true", "false"]).default("true"),
});

function parseSupplierForm(formData: FormData) {
  return supplierSchema.safeParse({
    name: formData.get("name"),
    contactPerson: formData.get("contactPerson") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    address: formData.get("address") || undefined,
    taxId: formData.get("taxId") || undefined,
    paymentTerms: formData.get("paymentTerms") || undefined,
    notes: formData.get("notes") || undefined,
    active: formData.get("active") ?? "true",
  });
}

async function findDuplicateSupplier(name: string, excludeId?: string) {
  return prisma.supplier.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

export async function createSupplierAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SUPPLIER_MANAGE");

  const parsed = parseSupplierForm(formData);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;

  if (await findDuplicateSupplier(data.name)) return "A supplier with this name already exists.";

  const supplier = await prisma.supplier.create({
    data: {
      name: data.name,
      contactPerson: data.contactPerson || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      taxId: data.taxId || null,
      paymentTerms: data.paymentTerms || null,
      notes: data.notes || null,
      active: data.active === "true",
    },
  });
  await logAudit(user.id, "SUPPLIER_CREATED", "Supplier", supplier.id, { name: supplier.name });

  redirect("/inventory/suppliers");
}

/**
 * One save can rename/edit details and change status together — each is
 * audited under its own precise action (spec Part C item 23), same
 * discipline as the Expense Category edit from the 2nd update.
 */
export async function updateSupplierAction(supplierId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SUPPLIER_MANAGE");

  const parsed = parseSupplierForm(formData);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;

  const existing = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  if (await findDuplicateSupplier(data.name, supplierId)) return "A supplier with this name already exists.";

  const nextActive = data.active === "true";
  const statusChanged = existing.active !== nextActive;

  await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      name: data.name,
      contactPerson: data.contactPerson || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      taxId: data.taxId || null,
      paymentTerms: data.paymentTerms || null,
      notes: data.notes || null,
      active: nextActive,
    },
  });

  await logAudit(user.id, "SUPPLIER_UPDATED", "Supplier", supplierId, { name: data.name });
  if (statusChanged) {
    await logAudit(user.id, nextActive ? "SUPPLIER_ACTIVATED" : "SUPPLIER_DEACTIVATED", "Supplier", supplierId, { name: data.name });
  }

  redirect(`/inventory/suppliers/${supplierId}`);
}
