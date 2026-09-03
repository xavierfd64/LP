"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { paymentSummary } from "@/lib/workflow";

async function requirePaymentRecordOrBackdate() {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  const allowed = (await can(user, "PAYMENT_RECORD")) || (await can(user, "PAYMENT_BACKDATE"));
  if (!allowed) throw new Error("You do not have permission to do this.");
  return user;
}

export type OrderSearchResult = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  quoteNumber: string | null;
};

const RESULT_LIMIT = 8;

/**
 * Backs the searchable Order combobox in the staff/admin Record Payment
 * modal (payment-form.tsx). Gated behind the same PAYMENT_RECORD permission
 * that already guards recordPaymentAction and the modal's own visibility —
 * never a way to browse/search orders a user couldn't otherwise reach.
 *
 * An empty/blank query returns the most recent orders (the "click to
 * browse" mode); a non-empty query searches server-side across order
 * number, customer name/phone/email, and quotation number — "invoice
 * number" is not a separate field in this data model (the Order's
 * orderNumber IS its invoice number, see app/(print)/orders/[id]/invoice),
 * so matching orderNumber already covers it. Never loads the full order
 * table into the browser: both paths cap results and run through Prisma's
 * where/take, mirroring globalSearchAction's approach.
 */
export async function searchOrdersForPaymentAction(query: string): Promise<OrderSearchResult[]> {
  // Also used by the Record Old Payment form (Historical Transaction
  // Encoding, Sept 3), whose actual gate is PAYMENT_BACKDATE, not
  // PAYMENT_RECORD — a staff member granted only the historical permission
  // must still be able to search for the order to pay against.
  await requirePaymentRecordOrBackdate();

  const q = query.trim();

  const orders = await prisma.order.findMany({
    where: q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { customer: { is: { name: { contains: q, mode: "insensitive" } } } },
            { customer: { is: { contactNumber: { contains: q, mode: "insensitive" } } } },
            { customer: { is: { email: { contains: q, mode: "insensitive" } } } },
            { quotation: { is: { quoteNumber: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {},
    include: { customer: true, quotation: true },
    orderBy: { createdAt: "desc" },
    take: RESULT_LIMIT,
  });

  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customer.name,
    customerPhone: o.customer.contactNumber,
    quoteNumber: o.quotation?.quoteNumber ?? null,
  }));
}

export type OrderBalanceResult = { ok: true; total: number; confirmedPaid: number; balanceDue: number } | { ok: false; error: string };

/**
 * Backs the Record Old Payment form's live "Order Total / Total Paid
 * (Before) / Balance" side panel (Historical Transaction Encoding, Sept 3
 * mockup, Section 4) — reuses paymentSummary(), the same confirmed-payment
 * total every other balance figure in the app already reads from, so this
 * preview can never disagree with what createPaymentRecord itself checks.
 */
export async function getOrderBalanceAction(orderId: string): Promise<OrderBalanceResult> {
  await requirePaymentRecordOrBackdate();
  if (!orderId) return { ok: false, error: "Select an order." };
  try {
    const summary = await paymentSummary(orderId);
    return { ok: true, total: summary.total, confirmedPaid: summary.confirmed, balanceDue: Math.max(summary.total - summary.confirmed, 0) };
  } catch {
    return { ok: false, error: "Order not found." };
  }
}
