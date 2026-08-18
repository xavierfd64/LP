"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";

export type GlobalSearchResult = {
  customers: { id: string; label: string; sub: string }[];
  quotations: { id: string; label: string; sub: string }[];
  jobOrders: { id: string; label: string; sub: string }[];
  orders: { id: string; label: string; sub: string }[];
};

const EMPTY: GlobalSearchResult = { customers: [], quotations: [], jobOrders: [], orders: [] };

/**
 * Header Global Search (spec item 9) — Staff/Admin only, permission-gated
 * per record type exactly like every other list page already is (never a
 * way to see records a role couldn't otherwise reach). Reuses the same
 * field-matching approach as searchCustomersForTransactionAction rather
 * than a separate search architecture, extended across Quotation/Job
 * Order/Order ("Invoice" is the Order's print view, not a separate model
 * — see the 4th update's Master Transaction work).
 */
export async function globalSearchAction(query: string): Promise<GlobalSearchResult> {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) return EMPTY;

  const q = query.trim();
  if (q.length < 2) return EMPTY;

  const [canCustomers, canQuotations, canOrders, canProduction] = await Promise.all([
    user.role === "ADMIN" || can(user, "CUSTOMER_VIEW"),
    user.role === "ADMIN" || can(user, "QUOTATION_VIEW"),
    user.role === "ADMIN" || can(user, "ORDER_VIEW"),
    user.role === "ADMIN" || can(user, "PRODUCTION_VIEW"),
  ]);

  const [customers, quotations, jobOrders, orders] = await Promise.all([
    canCustomers
      ? prisma.customer.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { displayId: { contains: q, mode: "insensitive" } },
              { companyName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 5,
        })
      : [],
    canQuotations
      ? prisma.quotation.findMany({
          where: {
            OR: [{ quoteNumber: { contains: q, mode: "insensitive" } }, { customer: { is: { name: { contains: q, mode: "insensitive" } } } }],
          },
          include: { customer: true },
          take: 5,
        })
      : [],
    canProduction
      ? prisma.jobOrder.findMany({
          where: {
            OR: [{ joNumber: { contains: q, mode: "insensitive" } }, { order: { is: { customer: { is: { name: { contains: q, mode: "insensitive" } } } } } }],
          },
          include: { order: { include: { customer: true } } },
          take: 5,
        })
      : [],
    canOrders
      ? prisma.order.findMany({
          where: {
            OR: [{ orderNumber: { contains: q, mode: "insensitive" } }, { customer: { is: { name: { contains: q, mode: "insensitive" } } } }],
          },
          include: { customer: true },
          take: 5,
        })
      : [],
  ]);

  return {
    customers: customers.map((c) => ({ id: c.id, label: c.name, sub: c.displayId })),
    quotations: quotations.map((q2) => ({ id: q2.id, label: q2.quoteNumber, sub: q2.customer.name })),
    jobOrders: jobOrders.map((j) => ({ id: j.id, label: j.joNumber, sub: j.order.customer.name })),
    orders: orders.map((o) => ({ id: o.id, label: o.orderNumber, sub: o.customer.name })),
  };
}
