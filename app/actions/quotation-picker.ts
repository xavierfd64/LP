"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";

export type QuotationSearchResult = {
  id: string;
  quoteNumber: string;
  customerId: string;
  customerName: string;
  total: string;
};

/**
 * Backs the Order form's "Source: From Quotation" combobox (Aug 22 3rd
 * update) — search-as-you-type over APPROVED quotations that don't
 * already have an Order, exactly the same eligibility the "Convert to
 * Order" button elsewhere in the app already enforces.
 */
export async function searchConvertibleQuotationsAction(query: string): Promise<QuotationSearchResult[]> {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) throw new Error("Not allowed.");
  if (user.role === "STAFF" && !(await can(user, "ORDER_CREATE"))) {
    throw new Error("You do not have permission to create orders.");
  }

  const q = query.trim();

  const quotations = await prisma.quotation.findMany({
    where: {
      status: "APPROVED",
      orders: { none: {} },
      ...(q
        ? {
            OR: [
              { quoteNumber: { contains: q, mode: "insensitive" } },
              { customer: { is: { name: { contains: q, mode: "insensitive" } } } },
              { customer: { is: { companyName: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    include: { customer: true },
    take: 10,
    orderBy: { createdAt: "desc" },
  });

  return quotations.map((q) => ({
    id: q.id,
    quoteNumber: q.quoteNumber,
    customerId: q.customerId,
    customerName: q.customer.name,
    total: q.total.toString(),
  }));
}
