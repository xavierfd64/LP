"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { logAudit } from "@/lib/audit";
import { notifyStaff } from "@/lib/notifications";
import { tryCreateInstantQuotation } from "@/lib/instant-quotation";

const inquirySchema = z.object({
  description: z.string().min(5, "Please describe what you need."),
  serviceId: z.string().min(1, "Please select a service."),
  specs: z.string().optional(),
  roughQty: z.coerce.number().int().positive().optional(),
  roughQtyUnit: z.string().max(40).optional(),
});

function parseSpecs(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function createInquiryAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  // Aug 22 3rd update — workflow correction: Admin/Staff can create a
  // Quotation directly and no longer need to (or may) submit an Inquiry on
  // a customer's behalf. Inquiries are customer-only from here on.
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");

  const parsed = inquirySchema.safeParse({
    description: formData.get("description"),
    serviceId: formData.get("serviceId"),
    specs: formData.get("specs") || undefined,
    roughQty: formData.get("roughQty") || undefined,
    roughQtyUnit: formData.get("roughQtyUnit") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const customer = await getCurrentCustomer(user.id);
  const customerId = customer.id;

  const service = await prisma.service.findUnique({ where: { id: parsed.data.serviceId } });
  if (!service || !service.active) return "Please select a valid, active service.";

  const inquiry = await prisma.inquiry.create({
    data: {
      customerId,
      description: parsed.data.description,
      desiredProduct: service.name,
      serviceId: service.id,
      specs: parseSpecs(parsed.data.specs),
      roughQty: parsed.data.roughQty,
      roughQtyUnit: parsed.data.roughQtyUnit,
    },
  });

  await logAudit(user.id, "INQUIRY_CREATED", "Inquiry", inquiry.id, { desiredProduct: inquiry.desiredProduct });
  await notifyStaff(
    "INQUIRY_CREATED",
    `New inquiry: ${inquiry.desiredProduct}`,
    `/inquiries/${inquiry.id}`
  );

  // Instant quotation (spec Part F/J): only fires for services Admin has
  // explicitly enabled with a valid pricing configuration; otherwise this
  // is a no-op and the Inquiry proceeds through the unmodified Staff
  // review flow exactly as before.
  await tryCreateInstantQuotation(inquiry);

  redirect(`/inquiries/${inquiry.id}`);
}

export async function closeInquiryAction(inquiryId: string) {
  const user = await requirePermission("INQUIRY_HANDLE");

  await prisma.inquiry.update({ where: { id: inquiryId }, data: { status: "CLOSED" } });
  await logAudit(user.id, "INQUIRY_CLOSED", "Inquiry", inquiryId);
  redirect(`/inquiries/${inquiryId}`);
}

const editInquirySchema = z.object({
  description: z.string().min(5, "Please describe what you need."),
  serviceId: z.string().min(1, "Please select a service."),
  specs: z.string().optional(),
  roughQty: z.coerce.number().int().positive().optional(),
});

async function assertOwnsEditableInquiry(user: { id: string; role: string }, inquiryId: string) {
  const inquiry = await prisma.inquiry.findUniqueOrThrow({ where: { id: inquiryId } });
  const customer = await getCurrentCustomer(user.id);
  if (inquiry.customerId !== customer.id) throw new Error("Not allowed.");
  if (inquiry.status !== "NEW") {
    redirect(`/inquiries/${inquiryId}?error=${encodeURIComponent("This inquiry can no longer be edited or cancelled — it's already been quoted, closed, or cancelled.")}`);
  }
  return inquiry;
}

export async function updateInquiryAction(inquiryId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");
  await assertOwnsEditableInquiry(user, inquiryId);

  const parsed = editInquirySchema.safeParse({
    description: formData.get("description"),
    serviceId: formData.get("serviceId"),
    specs: formData.get("specs") || undefined,
    roughQty: formData.get("roughQty") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const service = await prisma.service.findUnique({ where: { id: parsed.data.serviceId } });
  if (!service || !service.active) return "Please select a valid, active service.";

  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: {
      description: parsed.data.description,
      desiredProduct: service.name,
      serviceId: service.id,
      specs: parseSpecs(parsed.data.specs),
      roughQty: parsed.data.roughQty,
    },
  });

  await logAudit(user.id, "INQUIRY_UPDATED", "Inquiry", inquiryId, { desiredProduct: service.name });

  redirect(`/inquiries/${inquiryId}`);
}

export async function cancelInquiryAction(inquiryId: string) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");
  const inquiry = await assertOwnsEditableInquiry(user, inquiryId);

  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: {
      status: "CANCELLED",
      statusBeforeCancel: inquiry.status,
      cancelledAt: new Date(),
      cancelledById: user.id,
      cancelReason: "Cancelled by customer.",
    },
  });
  await logAudit(user.id, "INQUIRY_CANCELLED", "Inquiry", inquiryId, { previousStatus: inquiry.status });

  redirect(`/inquiries/${inquiryId}`);
}

const staffCancelInquirySchema = z.object({
  reason: z.string().min(3, "Enter a reason for cancelling."),
});

/**
 * Staff/admin cancel (Aug 25 update 1) — separate from the customer's own
 * cancelInquiryAction above (kept unchanged) since staff can cancel from
 * either NEW or QUOTED (a customer may only cancel while still NEW), and
 * staff must record a reason. Same INQUIRY_CANCEL permission gates
 * restoreInquiryAction below — one permission for the whole cancel/restore
 * workflow, mirroring how QUOTATION_CANCEL already governs quotation cancel.
 */
export async function staffCancelInquiryAction(inquiryId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("INQUIRY_CANCEL");
  const inquiry = await prisma.inquiry.findUniqueOrThrow({ where: { id: inquiryId } });

  if (inquiry.status !== "NEW" && inquiry.status !== "QUOTED") {
    return "This inquiry can no longer be cancelled.";
  }

  const parsed = staffCancelInquirySchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: {
      status: "CANCELLED",
      statusBeforeCancel: inquiry.status,
      cancelledAt: new Date(),
      cancelledById: user.id,
      cancelReason: parsed.data.reason,
    },
  });
  await logAudit(user.id, "INQUIRY_CANCELLED", "Inquiry", inquiryId, { previousStatus: inquiry.status, reason: parsed.data.reason });

  redirect(`/inquiries/${inquiryId}`);
}

/** Restores a cancelled inquiry to whatever status it was cancelled from (NEW or QUOTED) — never a blind reset to NEW. */
export async function restoreInquiryAction(inquiryId: string) {
  const user = await requirePermission("INQUIRY_CANCEL");
  const inquiry = await prisma.inquiry.findUniqueOrThrow({ where: { id: inquiryId } });

  if (inquiry.status !== "CANCELLED") return;

  const restoredStatus = inquiry.statusBeforeCancel ?? "NEW";
  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: {
      status: restoredStatus,
      statusBeforeCancel: null,
      cancelledAt: null,
      cancelledById: null,
      cancelReason: null,
    },
  });
  await logAudit(user.id, "INQUIRY_RESTORED", "Inquiry", inquiryId, { restoredStatus });

  redirect(`/inquiries/${inquiryId}`);
}
