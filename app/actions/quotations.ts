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
import { convertApprovedQuotation } from "@/lib/quotation-conversion";
import { calculatePricing } from "@/lib/pricing";

const lineItemsSchema = z.array(
  z.object({
    serviceId: z.string().min(1, "Please select a service for every line item."),
    description: z.string().min(1),
    qty: z.coerce.number().int().positive(),
    unitPrice: z.coerce.number().nonnegative(),
    specs: z.string().optional(),
  })
);

type ParsedLineItem = {
  serviceId: string;
  productType: string;
  description: string;
  qty: number;
  unitPrice: number;
  specs?: Record<string, string>;
};

/**
 * Parses the parallel per-row arrays submitted by LineItemsEditor and
 * re-derives each row's `productType` snapshot from the live Service
 * Master server-side (never trusting the client-synced hidden field) —
 * also rejects any row whose service is unknown/inactive.
 */
async function parseLineItems(formData: FormData): Promise<{ success: true; data: ParsedLineItem[] } | { success: false; message: string }> {
  const serviceIds = formData.getAll("serviceId") as string[];
  const descriptions = formData.getAll("description") as string[];
  const qtys = formData.getAll("qty") as string[];
  const unitPrices = formData.getAll("unitPrice") as string[];
  const specsRaw = formData.getAll("specs") as string[];

  const rawItems = serviceIds.map((_, i) => ({
    serviceId: serviceIds[i],
    description: descriptions[i],
    qty: qtys[i],
    unitPrice: unitPrices[i],
    specs: specsRaw[i] || undefined,
  }));

  const parsed = lineItemsSchema.safeParse(rawItems);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid line items." };

  const uniqueServiceIds = [...new Set(parsed.data.map((li) => li.serviceId))];
  const services = await prisma.service.findMany({ where: { id: { in: uniqueServiceIds }, active: true } });
  const serviceMap = new Map(services.map((s) => [s.id, s]));

  const items: ParsedLineItem[] = [];
  for (const li of parsed.data) {
    const service = serviceMap.get(li.serviceId);
    if (!service) return { success: false, message: "One or more selected services are invalid or inactive." };
    let specs: Record<string, string> | undefined;
    if (li.specs) {
      try {
        specs = JSON.parse(li.specs);
      } catch {
        specs = undefined;
      }
    }
    items.push({ serviceId: service.id, productType: service.name, description: li.description, qty: li.qty, unitPrice: li.unitPrice, specs });
  }
  return { success: true, data: items };
}

export async function createQuotationAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("QUOTATION_CREATE");

  const customerId = String(formData.get("customerId") ?? "");
  const inquiryId = (formData.get("inquiryId") as string) || undefined;
  const validUntilRaw = formData.get("validUntil") as string | null;
  const notesRaw = (formData.get("notes") as string) || undefined;

  const parsedItems = await parseLineItems(formData);
  if (!customerId) return "Please select a customer.";
  if (!parsedItems.success) return parsedItems.message;
  if (parsedItems.data.length === 0) return "Please provide at least one valid line item.";

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

  // The Order (Master Transaction) — and, if no payment is required first,
  // its Job Order — are created automatically here, right on approval, so
  // Staff never has to manually re-encode this quotation into a separate
  // Order/Job Order form.
  await convertApprovedQuotation(quotationId, user.id);

  redirect(`/quotations/${quotationId}`);
}

export async function rejectQuotationAction(quotationId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Only the customer can reject their own quotation.");

  const reason = ((formData.get("reason") as string) || "").trim();
  if (!reason) return "Please tell us why you're rejecting this quotation.";

  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } });
  const customer = await getCurrentCustomer(user.id);
  if (quotation.customerId !== customer.id) throw new Error("Not allowed.");
  if (quotation.status !== "SENT") {
    redirect(`/quotations/${quotationId}?error=${encodeURIComponent("Only a sent quotation can be rejected.")}`);
  }

  await prisma.quotation.update({ where: { id: quotationId }, data: { status: "REJECTED", rejectReason: reason } });
  await logAudit(user.id, "QUOTATION_REJECTED", "Quotation", quotationId, { reason });
  await notifyStaff("QUOTATION_REJECTED", `Quotation ${quotation.quoteNumber} was rejected by the customer: ${reason}`, `/quotations/${quotationId}`);
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
        serviceId: quotation.lineItems[0]?.serviceId ?? undefined,
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
  const parsedItems = await parseLineItems(formData);
  if (!parsedItems.success) return parsedItems.message;
  if (parsedItems.data.length === 0) return "Please provide at least one valid line item.";

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

const customerLineEditSchema = z.array(
  z.object({
    lineItemId: z.string().min(1),
    description: z.string().min(1),
    qty: z.coerce.number().int().positive(),
  })
);

/**
 * Customer self-edit of a quotation still awaiting their decision (spec
 * Aug 19 corrective update, items 16/17) — deliberately narrow: only
 * quantity and description are customer-editable, never price/service
 * (spec: "do NOT allow the customer to arbitrarily change system-
 * controlled pricing"). When a line's Service still has a valid instant-
 * pricing configuration, the new quantity is re-run through the exact
 * same pricing engine an Inquiry uses (base price -> tier -> bulk
 * discount -> promotion), so bulk tiers/promotions apply or fall away
 * correctly at the new quantity. For an ordinary staff-priced line (no
 * pricing engine behind it), the unit price is kept as-is and only the
 * arithmetic (unit price x new qty) is recomputed — never a fabricated
 * discount recalculation for a line nothing configured. Locked exactly
 * like every other quotation mutation: only while status is SENT, before
 * approval/rejection/conversion (spec item 16's explicit rule).
 */
export async function updateQuotationForCustomerAction(quotationId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Only the customer can edit their own quotation.");

  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: { lineItems: true } });
  const customer = await getCurrentCustomer(user.id);
  if (quotation.customerId !== customer.id) throw new Error("Not allowed.");
  if (quotation.status !== "SENT") return "This quotation can no longer be edited.";

  const lineItemIds = formData.getAll("lineItemId") as string[];
  const descriptions = formData.getAll("description") as string[];
  const qtys = formData.getAll("qty") as string[];
  const notes = (formData.get("notes") as string) || undefined;

  const rawRows = lineItemIds.map((_, i) => ({ lineItemId: lineItemIds[i], description: descriptions[i], qty: qtys[i] }));
  const parsed = customerLineEditSchema.safeParse(rawRows);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const ownLineItemIds = new Set(quotation.lineItems.map((li) => li.id));
  if (!parsed.data.every((r) => ownLineItemIds.has(r.lineItemId))) return "Invalid line item.";

  let subtotal = 0;
  let discountAmount = 0;
  const discountLabels: string[] = [];
  const updates: { id: string; description: string; qty: number; unitPrice: number }[] = [];

  for (const row of parsed.data) {
    const original = quotation.lineItems.find((li) => li.id === row.lineItemId)!;
    let unitPrice = Number(original.unitPrice);

    if (original.serviceId) {
      const pricing = await calculatePricing(original.serviceId, row.qty);
      if (pricing.available) {
        unitPrice = pricing.unitPrice;
        subtotal += pricing.subtotal;
        discountAmount += pricing.totalDiscountAmount;
        if (pricing.bulkDiscountLabel) discountLabels.push(pricing.bulkDiscountLabel);
        if (pricing.promoDiscountLabel) discountLabels.push(pricing.promoDiscountLabel);
        updates.push({ id: row.lineItemId, description: row.description, qty: row.qty, unitPrice: pricing.unitPrice });
        continue;
      }
    }
    subtotal += unitPrice * row.qty;
    updates.push({ id: row.lineItemId, description: row.description, qty: row.qty, unitPrice });
  }

  const total = Math.max(0, subtotal - discountAmount);

  await prisma.$transaction([
    ...updates.map((u) =>
      prisma.quotationLineItem.update({ where: { id: u.id }, data: { description: u.description, qty: u.qty, unitPrice: u.unitPrice } })
    ),
    prisma.quotation.update({
      where: { id: quotationId },
      data: {
        subtotal: quotation.subtotal != null || discountLabels.length > 0 ? subtotal : undefined,
        discountAmount,
        discountLabel: discountLabels.length > 0 ? [...new Set(discountLabels)].join(" + ") : null,
        total,
        notes: notes !== undefined ? notes : quotation.notes,
      },
    }),
  ]);

  await logAudit(user.id, "QUOTATION_EDITED_BY_CUSTOMER", "Quotation", quotationId, { total });
  await notifyStaff("QUOTATION_EDITED_BY_CUSTOMER", `Customer updated quotation ${quotation.quoteNumber}.`, `/quotations/${quotationId}`);

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

  await convertApprovedQuotation(quotationId, user.id);

  redirect(`/quotations/${quotationId}`);
}
