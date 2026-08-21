import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { getPrimaryKpis, getOverduePaymentsCount } from "@/lib/dashboard-data";
import { resolvePeriodRange } from "@/lib/transaction-summary";
import { type PaymentFilterPeriod } from "@/lib/payment-filter-periods";

/**
 * Data layer for the staff/admin Payments page's summary cards, search,
 * filters, and pagination. Deliberately reuses the app's existing
 * financial definitions rather than recomputing them a second way:
 * outstandingBalance comes straight from getPrimaryKpis() (same figure
 * the Admin dashboard KPI row shows), the overdue-payments count from
 * getOverduePaymentsCount() (the same one getNeedsAttention() uses), and
 * the date-range math from resolvePeriodRange() (the same period logic
 * every report page already uses) — no second "what counts as overdue /
 * this month" definition anywhere in this file.
 */

export type PaymentsSummary = {
  totalPaidThisMonth: number;
  paymentsCountThisMonth: number;
  outstandingBalance: number;
  overduePaymentsCount: number;
};

export async function getPaymentsSummary(): Promise<PaymentsSummary> {
  const { start, end } = resolvePeriodRange({ type: "monthly" });

  const [thisMonthAgg, kpis, overduePaymentsCount] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: "CONFIRMED", paymentDate: { gte: start, lt: end } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    getPrimaryKpis(),
    getOverduePaymentsCount(),
  ]);

  return {
    totalPaidThisMonth: Number(thisMonthAgg._sum.amount ?? 0),
    paymentsCountThisMonth: thisMonthAgg._count._all,
    outstandingBalance: kpis.outstandingBalance,
    overduePaymentsCount,
  };
}

// Method labels a free-text search term can match against, in addition to
// order number / customer name / reference number (spec item 4's "payment
// method" search target) — checked case-insensitively as a substring match
// against either the enum key or its human label.
const METHOD_SEARCH_LABELS: { value: "CASH" | "BANK_TRANSFER" | "GCASH" | "MAYA" | "CHEQUE" | "OTHER" | "VOUCHER"; labels: string[] }[] = [
  { value: "CASH", labels: ["cash"] },
  { value: "BANK_TRANSFER", labels: ["bank transfer", "bank"] },
  { value: "GCASH", labels: ["gcash"] },
  { value: "MAYA", labels: ["maya"] },
  { value: "CHEQUE", labels: ["cheque", "check"] },
  { value: "OTHER", labels: ["other"] },
  { value: "VOUCHER", labels: ["voucher"] },
];

export type PaymentListFilters = {
  page: number;
  pageSize: number;
  q?: string;
  status?: "PENDING" | "CONFIRMED" | "REJECTED";
  period?: PaymentFilterPeriod;
};

export async function getPaginatedPayments(filters: PaymentListFilters) {
  const { page, pageSize, q, status, period } = filters;

  const where: Prisma.PaymentWhereInput = {};
  if (status) where.status = status;
  if (period && period !== "all") {
    const { start, end } = resolvePeriodRange({ type: period });
    where.paymentDate = { gte: start, lt: end };
  }
  if (q && q.trim()) {
    const query = q.trim();
    const matchedMethod = METHOD_SEARCH_LABELS.find((m) => m.labels.some((l) => l.includes(query.toLowerCase())));
    where.OR = [
      { order: { orderNumber: { contains: query, mode: "insensitive" } } },
      { order: { customer: { name: { contains: query, mode: "insensitive" } } } },
      { referenceNumber: { contains: query, mode: "insensitive" } },
      ...(matchedMethod ? [{ method: matchedMethod.value }] : []),
    ];
  }

  const skip = (page - 1) * pageSize;

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { order: { include: { customer: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.payment.count({ where }),
  ]);

  return { payments, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
