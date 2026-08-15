"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { nextQuoteNumber } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";
import { ACTIVE_QUOTATION_STATUSES } from "@/lib/quotation-status";

const lineItemsSchema = z.array(
  z.object({
    productType: z.string().min(1),
    description: z.string().min(1),
    qty: z.coerce.number().int().positive(),
    unitPrice: z.coerce.number().nonnegative(),
  })
);

function parseLineItems(formData: FormData) {
  const productTypes = formData.getAll("productType") as string[];
  const descriptions = formData.getAll("description") as string[];
  const qtys = formData.getAll("qty") as string[];
  const unitPrices = formData.getAll("unitPrice") as string[];

  const rawItems = productTypes.map((_, i) => ({
    productType: productTypes[i],
    description: descriptions[i],
    qty: qtys[i],
    unitPrice: unitPrices[i],
  }));

  return lineItemsSchema.safeParse(rawItems);
}

export async function createQuotationAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("QUOTATION_CREATE");

  const customerId = String(formData.get("customerId") ?? "");
  const inquiryId = (formData.get("inquiryId") as string) || undefined;
  const validUntilRaw = formData.get("validUntil") as string | null;
  const notesRaw = (formData.get("notes") as string) || undefined;

  const parsedItems = parseLineItems(formData);
  if (!customerId) return "Please select a customer.";
  if (!parsedItems.success || parsedItems.data.length === 0) {
    return "Please provide at least one valid line item.";
  }

  if (inquiryId) {
    const existingActive = await prisma.quotation.findFirst({
      where: { inquiryId, status: { in: [...ACTIVE_QUOTATION_STATUSES] } },
    });
    if (existingActive) {
      return `This inquiry already has an active quotation (${existingActive.quoteNumber}). Revise that one instead of creating a new one.`;
    }
  }

  const total = parsedItems.data.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
  const quoteNumber = await nextQuoteNumber();

  const quotation = await prisma.quotation.create({
    data: {
      quoteNumber,
      customerId,
      inquiryId,
      status: "DRAFT",
      createdById: user.id,
      validUntil: validUntilRaw ? new Date(validUntilRaw) : undefined,
      notes: notesRaw,
      total,
      lineItems: { create: parsedItems.data },
    },
  });

  if (inquiryId) {
    await prisma.inquiry.update({ where: { id: inquiryId }, data: { status: "QUOTED" } });
  }

  await logAudit(user.id, "QUOTATION_CREATED", "Quotation", quotation.id, { total });

  redirect(`/quotations/${quotation.id}`);
}

export async function sendQuotationAction(quotationId: string) {
  const user = await requirePermission("QUOTATION_SEND");
  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } });

  if (quotation.status !== "DRAFT" && quotation.status !== "REVISION_REQUESTED") {
    redirect(`/quotations/${quotationId}?error=${encodeURIComponent("Only draft or revision-requested quotations can be sent.")}`);
  }

  await prisma.quotation.update({ where: { id: quotationId }, data: { status: "SENT" } });
  await logAudit(user.id, "QUOTATION_SENT", "Quotation", quotationId);
  await notifyCustomer(quotation.customerId, "QUOTATION_SENT", `Your quotation ${quotation.quoteNumber} is ready for review.`, `/quotations/${quotationId}`);
  redirect(`/quotations/${quotationId}`);
}

export async function approveQuotationAction(quotationId: string) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Only the customer can approve their own quotation.");

  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } });
  const customer = await getCurrentCustomer(user.id);
  if (quotation.customerId !== customer.id) throw new Error("Not allowed.");
  if (quotation.status !== "SENT") {
    redirect(`/quotations/${quotationId}?error=${encodeURIComponent("Only a sent quotation can be approved.")}`);
  }

  await prisma.quotation.update({ where: { id: quotationId }, data: { status: "APPROVED" } });
  await logAudit(user.id, "QUOTATION_APPROVED", "Quotation", quotationId);
  await notifyStaff("QUOTATION_APPROVED", `Quotation ${quotation.quoteNumber} was approved by the customer.`, `/quotations/${quotationId}`);
  redirect(`/quotations/${quotationId}`);
}

export async function rejectQuotationAction(quotationId: string) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Only the customer can reject their own quotation.");

  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } });
  const customer = await getCurrentCustomer(user.id);
  if (quotation.customerId !== customer.id) throw new Error("Not allowed.");
  if (quotation.status !== "SENT") {
    redirect(`/quotations/${quotationId}?error=${encodeURIComponent("Only a sent quotation can be rejected.")}`);
  }

  await prisma.quotation.update({ where: { id: quotationId }, data: { status: "REJECTED" } });
  await logAudit(user.id, "QUOTATION_REJECTED", "Quotation", quotationId);
  await notifyStaff("QUOTATION_REJECTED", `Quotation ${quotation.quoteNumber} was rejected by the customer.`, `/quotations/${quotationId}`);
  redirect(`/quotations/${quotationId}`);
}

const revisionRequestSchema = z.object({
  message: z.string().min(5, "Describe what you'd like changed."),
});

/**
 * Customer asks for changes to a SENT quotation. The quotation is parked as
 * REVISION_REQUESTED (not editable content directly — staff owns pricing)
 * and the request re-opens (or creates) the linked Inquiry so staff can
 * work the request through the normal inquiry -> quotation pipeline and
 * re-send a revised quote against the same quotation record.
 */
export async function requestQuotationRevisionAction(quotationId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { lineItems: true },
  });
  const customer = await getCurrentCustomer(user.id);
  if (quotation.customerId !== customer.id) throw new Error("Not allowed.");
  if (quotation.status !== "SENT") {
    return "Only a sent quotation can have changes requested.";
  }

  const parsed = revisionRequestSchema.safeParse({ message: formData.get("message") });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  let inquiryId = quotation.inquiryId;
  if (inquiryId) {
    await prisma.inquiry.update({ where: { id: inquiryId }, data: { status: "NEW" } });
  } else {
    const desiredProduct = quotation.lineItems.map((li) => li.productType).join(", ") || "Revised quotation";
    const newInquiry = await prisma.inquiry.create({
      data: {
        customerId: customer.id,
        description: parsed.data.message,
        desiredProduct,
        status: "NEW",
      },
    });
    inquiryId = newInquiry.id;
    await prisma.quotation.update({ where: { id: quotationId }, data: { inquiryId } });
  }

  await prisma.$transaction([
    prisma.quotationRevisionRequest.create({
      data: { quotationId, customerId: customer.id, message: parsed.data.message },
    }),
    prisma.quotation.update({ where: { id: quotationId }, data: { status: "REVISION_REQUESTED" } }),
  ]);

  await logAudit(user.id, "QUOTATION_REVISION_REQUESTED", "Quotation", quotationId, { message: parsed.data.message });
  await notifyStaff(
    "QUOTATION_REVISION_REQUESTED",
    `Customer requested changes to quotation ${quotation.quoteNumber}.`,
    `/inquiries/${inquiryId}`
  );

  redirect(`/quotations/${quotationId}`);
}

export async function editQuotationAction(quotationId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("QUOTATION_EDIT");
  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } });

  if (!["DRAFT", "SENT", "REVISION_REQUESTED"].includes(quotation.status)) {
    return "This quotation can no longer be edited.";
  }

  const validUntilRaw = formData.get("validUntil") as string | null;
  const notesRaw = (formData.get("notes") as string) || undefined;
  const parsedItems = parseLineItems(formData);
  if (!parsedItems.success || parsedItems.data.length === 0) {
    return "Please provide at least one valid line item.";
  }

  const total = parsedItems.data.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);

  await prisma.$transaction([
    prisma.quotationLineItem.deleteMany({ where: { quotationId } }),
    prisma.quotation.update({
      where: { id: quotationId },
      data: {
        total,
        validUntil: validUntilRaw ? new Date(validUntilRaw) : undefined,
        notes: notesRaw,
        lineItems: { create: parsedItems.data },
      },
    }),
  ]);

  await logAudit(user.id, "QUOTATION_EDITED", "Quotation", quotationId, { total });

  redirect(`/quotations/${quotationId}`);
}

const cancelQuotationSchema = z.object({
  reason: z.string().min(3, "Enter a reason for cancelling."),
});

/** Staff/admin can cancel a quotation outright — at the customer's request, or to correct pricing mistakes. */
export async function cancelQuotationAction(quotationId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("QUOTATION_CANCEL");
  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } });

  if (!["DRAFT", "SENT", "REVISION_REQUESTED"].includes(quotation.status)) {
    return "This quotation can no longer be cancelled.";
  }

  const parsed = cancelQuotationSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  await prisma.quotation.update({
    where: { id: quotationId },
    data: { status: "CANCELLED", cancelledById: user.id, cancelReason: parsed.data.reason },
  });

  await logAudit(user.id, "QUOTATION_CANCELLED", "Quotation", quotationId, { reason: parsed.data.reason });
  await notifyCustomer(
    quotation.customerId,
    "QUOTATION_CANCELLED",
    `Quotation ${quotation.quoteNumber} was cancelled: ${parsed.data.reason}`,
    `/quotations/${quotationId}`
  );

  redirect(`/quotations/${quotationId}`);
}

const forceApproveSchema = z.object({
  reason: z.string().min(3, "Enter a reason for the rush approval."),
});

/** Staff/admin bypass of customer approval for rush jobs — always audit-logged with a reason, distinct from a genuine customer click. */
export async function forceApproveQuotationAction(quotationId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("QUOTATION_APPROVE_REJECT");
  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } });

  if (quotation.status !== "SENT") {
    return "Only a sent quotation can be force-approved.";
  }

  const parsed = forceApproveSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  await prisma.quotation.update({
    where: { id: quotationId },
    data: { status: "APPROVED", approvedByStaffId: user.id, approvalBypassReason: parsed.data.reason },
  });

  await logAudit(user.id, "QUOTATION_FORCE_APPROVED", "Quotation", quotationId, { reason: parsed.data.reason });
  await notifyCustomer(
    quotation.customerId,
    "QUOTATION_FORCE_APPROVED",
    `Quotation ${quotation.quoteNumber} was approved on your behalf for rush processing.`,
    `/quotations/${quotationId}`
  );

  redirect(`/quotations/${quotationId}`);
}
