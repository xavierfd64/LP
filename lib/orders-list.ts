import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { resolvePeriodRange } from "@/lib/transaction-summary";
import type { PaymentFilterPeriod } from "@/lib/payment-filter-periods";

/** Data layer for the staff/admin Orders dashboard (Aug 22 UI redesign update 2) — same one-authoritative-filter pattern as the other list dashboards. */

export type OrderSearchFilters = {
  q?: string;
  status?: "OPEN" | "IN_PRODUCTION" | "FULFILLING" | "COMPLETED" | "CANCELLED";
  period?: PaymentFilterPeriod;
};
export type OrderListFilters = OrderSearchFilters & { page: number; pageSize: number };

export function buildOrderWhere({ q, status, period }: OrderSearchFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  if (status) where.status = status;
  if (period && period !== "all") {
    const { start, end } = resolvePeriodRange({ type: period });
    where.createdAt = { gte: start, lt: end };
  }
  if (q && q.trim()) {
    const query = q.trim();
    where.OR = [
      { orderNumber: { contains: query, mode: "insensitive" } },
      { customer: { name: { contains: query, mode: "insensitive" } } },
      { customer: { contactNumber: { contains: query, mode: "insensitive" } } },
      { customer: { email: { contains: query, mode: "insensitive" } } },
      { jobOrders: { some: { joNumber: { contains: query, mode: "insensitive" } } } },
      { quotation: { is: { quoteNumber: { contains: query, mode: "insensitive" } } } },
    ];
  }
  return where;
}

export async function getPaginatedOrders(filters: OrderListFilters) {
  const { page, pageSize, ...searchFilters } = filters;
  const where = buildOrderWhere(searchFilters);
  const skip = (page - 1) * pageSize;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { customer: true, jobOrders: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** All four cards scoped to "this month", matching the illustration. */
export async function getOrdersSummary() {
  const { start, end } = resolvePeriodRange({ type: "monthly" });
  const monthWhere = { createdAt: { gte: start, lt: end } };
  const [total, open, inProduction, completed] = await Promise.all([
    prisma.order.count({ where: monthWhere }),
    prisma.order.count({ where: { ...monthWhere, status: "OPEN" } }),
    prisma.order.count({ where: { ...monthWhere, status: "IN_PRODUCTION" } }),
    prisma.order.count({ where: { ...monthWhere, status: "COMPLETED" } }),
  ]);
  return { total, open, inProduction, completed };
}

export const EXPORT_ROW_CAP = 5000;

export async function getOrdersForExport(filters: OrderSearchFilters) {
  const where = buildOrderWhere(filters);
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { customer: true, jobOrders: true },
      orderBy: { createdAt: "desc" },
      take: EXPORT_ROW_CAP,
    }),
    prisma.order.count({ where }),
  ]);
  return { orders, total, truncated: total > EXPORT_ROW_CAP };
}

export type OrderExportRow = Awaited<ReturnType<typeof getOrdersForExport>>["orders"][number];
