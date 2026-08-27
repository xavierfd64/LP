"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { paymentSummary } from "@/lib/workflow";

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
      };
    }
  | { ok: false; error: string };

export async function getQuotationDetailAction(id: string): Promise<QuotationDetailResult> {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: { customer: true, lineItems: true, orders: true, createdBy: true },
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
    },
  };
}
