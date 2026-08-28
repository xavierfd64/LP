"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { paymentSummary } from "@/lib/workflow";
import { FORCE_APPROVABLE_STATUSES, SENDABLE_QUOTATION_STATUSES } from "@/lib/quotation-status";
import { findActiveShareLink } from "@/lib/document-sharing";
import { generateSecureToken } from "@/lib/order-tracking";

/**
 * Backs the Quotation Details modal (Aug 22 UI redesign update 2, Part 6)
 * — the staff/admin Quotations list's "View" action, which must open a
 * modal instead of navigating to /quotations/[id]. The full page (send,
 * edit, cancel, share links, tracking, revision requests, costing) stays
 * exactly as-is for deeper management; this returns only what the
 * illustration's read-focused summary needs, under the same authorization
 * the page itself already enforces — no new discount/tax logic, this just
 * surfaces the values already stored/computed on the Quotation record.
 */
export type QuotationDetailResult =
  | {
      ok: true;
      data: {
        id: string;
        quoteNumber: string;
        status: string;
        createdAt: string;
        validUntil: string | null;
        createdByName: string | null;
        customerName: string;
        customerEmail: string | null;
        customerContact: string | null;
        lineItems: { id: string; productType: string; description: string; qty: number; unit: string | null; unitPrice: string }[];
        subtotal: string | null;
        discountAmount: string;
        discountLabel: string | null;
        taxAmount: string;
        total: string;
        notes: string | null;
        hasOrder: boolean;
        orderId: string | null;
        orderNumber: string | null;
        canConvertToOrder: boolean;
        /** Order-side balance (1st Update item 4) — populated only once a real Order exists, so RECORD PAYMENT / PAYMENT EXEMPTION can be offered directly from this popup. */
        balanceDue: string | null;
        confirmedPaid: string | null;
        fullyPaid: boolean;
        canRecordPayment: boolean;
        canGrantPaymentExemption: boolean;
        /** Approve on Behalf of Customer (Aug 27 final update) — only offered while the quotation is still awaiting a decision AND the viewer holds QUOTATION_APPROVE_REJECT. */
        canForceApprove: boolean;
        approvedByStaffName: string | null;
        approvalBypassReason: string | null;
        /**
         * Update 2 — Quotation Details popup enhancement. shareToken backs
         * the always-available, view-only "Quotation Link" (reuses the
         * existing DocumentShareLink mechanism — see lib/document-sharing.ts
         * — auto-generated below rather than requiring an explicit "Share
         * Document" click, since the spec requires the link to always
         * exist). customerHasActivatedAccount mirrors this app's existing
         * "Activated"/"Not Activated" concept (Customer.userId set or not —
         * see components/customers/customer-picker.tsx's identical hasLogin
         * framing); canSendToCustomerAccount additionally requires
         * QUOTATION_SEND and a still-open status.
         */
        shareToken: string;
        customerHasActivatedAccount: boolean;
        canSendToCustomerAccount: boolean;
      };
    }
  | { ok: false; error: string };

export async function getQuotationDetailAction(id: string): Promise<QuotationDetailResult> {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: { customer: true, lineItems: true, orders: true, createdBy: true, approvedByStaff: true },
  });
  if (!quotation) return { ok: false, error: "Quotation not found." };

  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (quotation.customerId !== customer.id) return { ok: false, error: "Not authorized." };
  } else if (user.role === "STAFF" && !(await can(user, "QUOTATION_VIEW"))) {
    return { ok: false, error: "Not authorized." };
  }

  const canCreateOrder = user.role === "ADMIN" || (await can(user, "ORDER_CREATE"));
  const hasOrder = quotation.orders.length > 0;
  const order = hasOrder ? quotation.orders[0] : null;

  // Always-available view-only link (Update 2) — auto-generate one the
  // first time this popup is opened for a quotation that doesn't have an
  // active share link yet, rather than requiring a separate "Share
  // Document" click first. Reuses the exact same DocumentShareLink model/
  // token generation the full quotation page's DocumentShareManager
  // already uses; this is not a second link mechanism.
  let shareLink = await findActiveShareLink("QUOTATION", quotation.id);
  if (!shareLink) {
    shareLink = await prisma.documentShareLink.create({
      data: { token: generateSecureToken(), quotationId: quotation.id, accessLevel: "VIEW_ONLY", createdById: user.id },
    });
  }

  const canSend = user.role === "ADMIN" || (await can(user, "QUOTATION_SEND"));
  const customerHasActivatedAccount = !!quotation.customer.userId;
  const canSendToCustomerAccount =
    isStaffLike &&
    canSend &&
    customerHasActivatedAccount &&
    SENDABLE_QUOTATION_STATUSES.includes(quotation.status as (typeof SENDABLE_QUOTATION_STATUSES)[number]);

  let balanceDue: string | null = null;
  let confirmedPaid: string | null = null;
  let fullyPaid = false;
  if (order) {
    const summary = await paymentSummary(order.id);
    balanceDue = Math.max(summary.total - summary.confirmed, 0).toString();
    confirmedPaid = summary.confirmed.toString();
    fullyPaid = summary.fullyPaid;
  }

  const canRecordPayment = isStaffLike && (user.role === "ADMIN" || (await can(user, "PAYMENT_RECORD")));
  // Reuses ORDER_MODIFY — the same permission that already gates granting a
  // release exception (app/actions/payments.ts's grantReleaseExceptionAction),
  // since both are "override a payment/production control on this Order"
  // actions. No new Permission is introduced for this.
  const canGrantPaymentExemption = isStaffLike && (user.role === "ADMIN" || (await can(user, "ORDER_MODIFY")));
  const canForceApprove =
    isStaffLike &&
    (user.role === "ADMIN" || (await can(user, "QUOTATION_APPROVE_REJECT"))) &&
    FORCE_APPROVABLE_STATUSES.includes(quotation.status as (typeof FORCE_APPROVABLE_STATUSES)[number]);

  return {
    ok: true,
    data: {
      id: quotation.id,
      quoteNumber: quotation.quoteNumber,
      status: quotation.status,
      createdAt: quotation.createdAt.toISOString(),
      validUntil: quotation.validUntil ? quotation.validUntil.toISOString() : null,
      createdByName: quotation.createdBy?.name ?? null,
      customerName: quotation.customer.name,
      customerEmail: quotation.customer.email,
      customerContact: quotation.customer.contactNumber,
      lineItems: quotation.lineItems.map((li) => ({
        id: li.id,
        productType: li.productType,
        description: li.description,
        qty: li.qty,
        unit: li.unit,
        unitPrice: li.unitPrice.toString(),
      })),
      subtotal: quotation.subtotal != null ? quotation.subtotal.toString() : null,
      discountAmount: quotation.discountAmount.toString(),
      discountLabel: quotation.discountLabel,
      taxAmount: quotation.taxAmount.toString(),
      total: quotation.total.toString(),
      notes: quotation.notes,
      hasOrder,
      orderId: order?.id ?? null,
      orderNumber: order?.orderNumber ?? null,
      canConvertToOrder: isStaffLike && canCreateOrder && quotation.status === "APPROVED" && !hasOrder,
      balanceDue,
      confirmedPaid,
      fullyPaid,
      canRecordPayment: !!order && canRecordPayment && !fullyPaid,
      canGrantPaymentExemption: !!order && canGrantPaymentExemption && !fullyPaid,
      canForceApprove,
      approvedByStaffName: quotation.approvedByStaff?.name ?? null,
      approvalBypassReason: quotation.approvalBypassReason,
      shareToken: shareLink.token,
      customerHasActivatedAccount,
      canSendToCustomerAccount,
    },
  };
}
