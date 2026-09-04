"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { paymentSummary } from "@/lib/workflow";

/**
 * Backs the Order Details modal (Aug 22 UI redesign update 2, Part 7) —
 * the staff/admin Orders list's "View" action, which must open a modal
 * instead of navigating to /orders/[id]. The full page (job order
 * management, fulfillment/tracking, share links, transaction history,
 * messages) stays exactly as-is; this returns only what the illustration's
 * read-focused summary needs, under the same authorization the page
 * itself already enforces.
 *
 * Order items mirror the exact same derivation the Invoice print view
 * already uses (app/(print)/orders/[id]/invoice): the linked Quotation's
 * line items when one exists, else the Order's OWN persisted line items
 * (Sept 4 correction — a manual/historical order now saves these; see
 * OrderLineItem's schema doc comment), else — only for an order that
 * genuinely predates that fix and has neither — a single summary line
 * derived from the Order's own total. Never a second, different
 * definition of "what this order contains".
 */
export type OrderDetailResult =
  | {
      ok: true;
      data: {
        id: string;
        orderNumber: string;
        status: string;
        orderDate: string;
        dueDate: string | null;
        isHistorical: boolean;
        historicalOrderType: "PENDING_PRODUCTION" | "ALREADY_RELEASED" | null;
        historicalNotes: string | null;
        paymentTermType: string;
        customerName: string;
        customerEmail: string | null;
        customerContact: string | null;
        items: { id: string; productType: string; description: string; qty: number; unit: string | null; unitPrice: string }[];
        totalAmount: string;
        confirmedPaid: string;
        balanceDue: string;
        canRecordPayment: boolean;
        notes: string | null;
        jobOrders: { id: string; joNumber: string; status: string }[];
      };
    }
  | { ok: false; error: string };

export async function getOrderDetailAction(id: string): Promise<OrderDetailResult> {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      quotation: { include: { lineItems: true } },
      lineItems: true,
      jobOrders: { orderBy: { joNumber: "asc" } },
    },
  });
  if (!order) return { ok: false, error: "Order not found." };

  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (order.customerId !== customer.id) return { ok: false, error: "Not authorized." };
  } else if (user.role === "STAFF" && !(await can(user, "ORDER_VIEW"))) {
    return { ok: false, error: "Not authorized." };
  }

  const canRecordPayment = user.role === "ADMIN" || (await can(user, "PAYMENT_RECORD"));
  const summary = await paymentSummary(order.id);

  const items =
    order.quotation && order.quotation.lineItems.length > 0
      ? order.quotation.lineItems.map((li) => ({
          id: li.id,
          productType: li.productType,
          description: li.description,
          qty: li.qty,
          unit: li.unit,
          unitPrice: li.unitPrice.toString(),
        }))
      : order.lineItems.length > 0
        ? order.lineItems.map((li) => ({
            id: li.id,
            productType: li.productType,
            description: li.description,
            qty: li.qty,
            unit: li.unit,
            unitPrice: li.unitPrice.toString(),
          }))
        : [
            {
              id: order.id,
              productType: order.jobOrders[0]?.productType ?? "Order",
              description: `Order ${order.orderNumber}`,
              qty: 1,
              unit: null,
              unitPrice: order.totalAmount.toString(),
            },
          ];

  return {
    ok: true,
    data: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      orderDate: order.orderDate.toISOString(),
      dueDate: order.dueDate ? order.dueDate.toISOString() : null,
      isHistorical: order.isHistorical,
      historicalOrderType: order.historicalOrderType,
      historicalNotes: order.historicalNotes,
      paymentTermType: order.paymentTermType,
      customerName: order.customer.name,
      customerEmail: order.customer.email,
      customerContact: order.customer.contactNumber,
      items,
      totalAmount: order.totalAmount.toString(),
      confirmedPaid: summary.confirmed.toString(),
      balanceDue: Math.max(summary.total - summary.confirmed, 0).toString(),
      canRecordPayment: isStaffLike && canRecordPayment && !summary.fullyPaid,
      notes: order.quotation?.notes ?? null,
      jobOrders: order.jobOrders.map((jo) => ({ id: jo.id, joNumber: jo.joNumber, status: jo.status })),
    },
  };
}
