"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";

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
  await requirePermission("PAYMENT_RECORD");

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
