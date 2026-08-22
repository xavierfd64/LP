"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";

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
        canConvertToOrder: boolean;
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
      orderId: hasOrder ? quotation.orders[0].id : null,
      canConvertToOrder: isStaffLike && canCreateOrder && quotation.status === "APPROVED" && !hasOrder,
    },
  };
}
