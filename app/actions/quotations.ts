"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { requirePermission, can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { nextQuoteNumber } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";
import { ACTIVE_QUOTATION_STATUSES, FORCE_APPROVABLE_STATUSES } from "@/lib/quotation-status";
import { convertApprovedQuotation } from "@/lib/quotation-conversion";
import { calculatePricing } from "@/lib/pricing";

const lineItemsSchema = z.array(
  z.object({
    serviceId: z.string().min(1, "Please select a service for every line item."),
    description: z.string().optional().default(""),
    qty: z.coerce.number().int().positive(),
    unit: z.string().max(40).optional(),
    unitPrice: z.coerce.number().nonnegative(),
    specs: z.record(z.string(), z.string()).optional(),
  })
);

type ParsedLineItem = {
  serviceId: string;
  productType: string;
  description: string;
  qty: number;
  unit?: string;
  unitPrice: number;
  specs?: Record<string, string>;
};

/**
 * Parses the single `lineItemsJson` blob LineItemsEditor submits and
 * re-derives each row's `productType` snapshot from the live Service
 * Master server-side (never trusting the client-synced hidden field) —
 * also rejects any row whose service is unknown/inactive. A single JSON
 * field (rather than parallel getAll() arrays) is deliberate: the editor
 * renders both a desktop table and a mobile card layout for the same
 * items at once (only one visible per breakpoint via CSS), so per-row
 * named inputs would each submit twice.
 */
async function parseLineItems(formData: FormData): Promise<{ success: true; data: ParsedLineItem[] } | { success: false; message: string }> {
  const raw = formData.get("lineItemsJson");
  let rawItems: unknown;
  try {
    rawItems = raw ? JSON.parse(raw as string) : [];
  } catch {
    return { success: false, message: "Invalid line items." };
  }

  const parsed = lineItemsSchema.safeParse(rawItems);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid line items." };

  const uniqueServiceIds = [...new Set(parsed.data.map((li) => li.serviceId))];
  const services = await prisma.service.findMany({ where: { id: { in: uniqueServiceIds }, active: true } });
  const serviceMap = new Map(services.map((s) => [s.id, s]));

  const items: ParsedLineItem[] = [];
  for (const li of parsed.data) {
    const service = serviceMap.get(li.serviceId);
    if (!service) return { success: false, message: "One or more selected services are invalid or inactive." };
    items.push({ serviceId: service.id, productType: service.name, description: li.description, qty: li.qty, unit: li.unit, unitPrice: li.unitPrice, specs: li.specs });
  }
  return { success: true, data: items };
}

function clampPct(raw: FormDataEntryValue | null): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export async function createQuotationAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("QUOTATION_CREATE");

  const customerId = String(formData.get("customerId") ?? "");
  const inquiryId = (formData.get("inquiryId") as string) || undefined;
  const validUntilRaw = formData.get("validUntil") as string | null;
  const notesRaw = (formData.get("notes") as string) || undefined;
  // Aug 22 3rd update — Quotation Totals now supports a manual overall
  // Discount (%) and Tax/VAT (%), recomputed from the line items here
  // (never trusting a client-submitted total) exactly like every other
  // pricing figure in this codebase.
  const discountPct = clampPct(formData.get("discountPct"));
  const taxPct = clampPct(formData.get("taxPct"));
  const intent = formData.get("intent") === "send" ? "send" : "draft";

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

  if (intent === "send") {
    const canSend = user.role === "ADMIN" || (await can(user, "QUOTATION_SEND"));
    if (!canSend) return "You do not have permission to send quotations to a customer. Save as draft instead.";
  }

  const subtotal = parsedItems.data.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
  const discountAmount = (subtotal * discountPct) / 100;
  const taxAmount = ((subtotal - discountAmount) * taxPct) / 100;
  const total = subtotal - discountAmount + taxAmount;
  const quoteNumber = await nextQuoteNumber();

  const quotation = await prisma.quotation.create({
    data: {
      quoteNumber,
      customerId,
      inquiryId,
      status: intent === "send" ? "SENT" : "DRAFT",
      createdById: user.id,
      validUntil: validUntilRaw ? new Date(validUntilRaw) : undefined,
      notes: notesRaw,
      subtotal,
      discountAmount,
      discountLabel: discountPct > 0 ? `Discount (${discountPct}%)` : null,
      taxAmount,
      total,
      lineItems: { create: parsedItems.data },
    },
  });

  if (inquiryId) {
    await prisma.inquiry.update({ where: { id: inquiryId }, data: { status: "QUOTED" } });
  }

  await logAudit(user.id, "QUOTATION_CREATED", "Quotation", quotation.id, { total });
  if (intent === "send") {
    await logAudit(user.id, "QUOTATION_SENT", "Quotation", quotation.id);
    await notifyCustomer(customerId, "QUOTATION_SENT", `Your quotation ${quotation.quoteNumber} is ready for review.`, `/quotations/${quotation.id}`);
  }

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

  // One consistent calculation flow, same as createQuotationAction: Line
  // Items -> Subtotal -> Discount/Tax adjustments -> Grand Total. This form
  // has no Discount %/Tax % inputs of its own (editing here only changes
  // line items/validity/notes), so the *rate* this quotation was already
  // using is derived from its last saved figures and reapplied to the
  // freshly-computed subtotal — never left stale, and never silently
  // dropped to a flat leftover amount that stops reflecting the same %.
  const oldSubtotal = quotation.subtotal != null ? Number(quotation.subtotal) : Number(quotation.total) + Number(quotation.discountAmount) - Number(quotation.taxAmount);
  const oldDiscountAmount = Number(quotation.discountAmount);
  const oldAfterDiscount = oldSubtotal - oldDiscountAmount;
  const discountRate = oldSubtotal > 0 ? oldDiscountAmount / oldSubtotal : 0;
  const taxRate = oldAfterDiscount > 0 ? Number(quotation.taxAmount) / oldAfterDiscount : 0;

  const subtotal = parsedItems.data.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
  const discountAmount = subtotal * discountRate;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * taxRate;
  const total = afterDiscount + taxAmount;

  await prisma.$transaction([
    prisma.quotationLineItem.deleteMany({ where: { quotationId } }),
    prisma.quotation.update({
      where: { id: quotationId },
      data: {
        subtotal,
        discountAmount,
        taxAmount,
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
    data: {
      status: "CANCELLED",
      statusBeforeCancel: quotation.status,
      cancelledById: user.id,
      cancelReason: parsed.data.reason,
      cancelledAt: new Date(),
    },
  });

  await logAudit(user.id, "QUOTATION_CANCELLED", "Quotation", quotationId, { previousStatus: quotation.status, reason: parsed.data.reason });
  await notifyCustomer(
    quotation.customerId,
    "QUOTATION_CANCELLED",
    `Quotation ${quotation.quoteNumber} was cancelled: ${parsed.data.reason}`,
    `/quotations/${quotationId}`
  );

  redirect(`/quotations/${quotationId}`);
}

/**
 * Restores a cancelled quotation to whatever status it was cancelled from
 * (DRAFT/SENT/REVISION_REQUESTED) — never a blind reset to DRAFT. Gated by
 * the same QUOTATION_CANCEL permission as cancelQuotationAction, mirroring
 * the Inquiry cancel/restore pair.
 */
export async function restoreQuotationAction(quotationId: string) {
  const user = await requirePermission("QUOTATION_CANCEL");
  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } });

  if (quotation.status !== "CANCELLED") return;

  const restoredStatus = quotation.statusBeforeCancel ?? "DRAFT";
  await prisma.quotation.update({
    where: { id: quotationId },
    data: {
      status: restoredStatus,
      statusBeforeCancel: null,
      cancelledById: null,
      cancelReason: null,
      cancelledAt: null,
    },
  });
  await logAudit(user.id, "QUOTATION_RESTORED", "Quotation", quotationId, { restoredStatus });

  redirect(`/quotations/${quotationId}`);
}

const forceApproveSchema = z.object({
  // .trim() runs before .min(3), so a whitespace-only reason ("   ") is
  // reduced to an empty string and correctly rejected — a bare .min(3)
  // would have let 3+ spaces through as if they were a real reason.
  reason: z.string().trim().min(3, "Enter a reason for the approval."),
});

/**
 * Shared core for "approve on the customer's behalf" — used by both the
 * full quotation page's ForceApproveForm and the Quotation Details popup's
 * Approve button (quotation-detail-modal.tsx / approve-on-behalf-dialog.tsx).
 * One place writes approvedByStaffId/approvalBypassReason, logs the audit
 * entry, and drives the quotation through the exact same downstream
 * conversion (Order/Job Order creation, payment gates) a genuine customer
 * approval uses — never a second, divergent approval path.
 */
async function forceApproveQuotationCore(quotationId: string, actorId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } });

  if (!FORCE_APPROVABLE_STATUSES.includes(quotation.status as (typeof FORCE_APPROVABLE_STATUSES)[number])) {
    return { ok: false, error: "This quotation can no longer be approved on the customer's behalf." };
  }

  const parsed = forceApproveSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  await prisma.quotation.update({
    where: { id: quotationId },
    data: { status: "APPROVED", approvedByStaffId: actorId, approvalBypassReason: parsed.data.reason },
  });

  await logAudit(actorId, "QUOTATION_FORCE_APPROVED", "Quotation", quotationId, { reason: parsed.data.reason });
  await notifyCustomer(
    quotation.customerId,
    "QUOTATION_FORCE_APPROVED",
    `Quotation ${quotation.quoteNumber} was approved on your behalf: ${parsed.data.reason}`,
    `/quotations/${quotationId}`
  );
  // Mirrors approveQuotationAction's own notifyStaff call for a genuine
  // customer approval (system-wide sync corrective update, Aug 28) — so
  // other Admin/Staff sessions with the Quotations list open pick up the
  // status change live via the existing notification-triggered refresh,
  // the same as they already do when a customer approves directly.
  await notifyStaff("QUOTATION_APPROVED", `Quotation ${quotation.quoteNumber} was approved on the customer's behalf by staff.`, `/quotations/${quotationId}`);

  await convertApprovedQuotation(quotationId, actorId);
  return { ok: true };
}

/** Staff/admin bypass of customer approval, from the full quotation page's ForceApproveForm — always audit-logged with a reason, distinct from a genuine customer click. */
export async function forceApproveQuotationAction(quotationId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("QUOTATION_APPROVE_REJECT");
  const result = await forceApproveQuotationCore(quotationId, user.id, String(formData.get("reason") ?? ""));
  if (!result.ok) return result.error;
  redirect(`/quotations/${quotationId}`);
}

/**
 * Same bypass as forceApproveQuotationAction, but non-redirecting — for the
 * Approve on Behalf of Customer dialog opened from the Quotation Details
 * popup (must stay inside the popup, never navigate away). Re-validates
 * authorization, quotation status, and the reason itself server-side —
 * never trusts that the Approve button was only shown to an authorized
 * user, so a direct call from an unauthorized account is rejected here too.
 */
export async function forceApproveQuotationFromModalAction(quotationId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requirePermission("QUOTATION_APPROVE_REJECT");
  return forceApproveQuotationCore(quotationId, user.id, reason);
}
