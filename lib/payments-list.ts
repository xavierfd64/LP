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

export type PaymentSearchFilters = {
  q?: string;
  status?: "PENDING" | "CONFIRMED" | "REJECTED";
  period?: PaymentFilterPeriod;
};

export type PaymentListFilters = PaymentSearchFilters & {
  page: number;
  pageSize: number;
};

/**
 * The one authoritative "which payments match the current filters"
 * definition — used by both the paginated table (getPaginatedPayments)
 * and the export data functions below, so a filtered export can never
 * drift from what the table itself shows for the same q/status/period.
 */
export function buildPaymentWhere({ q, status, period }: PaymentSearchFilters): Prisma.PaymentWhereInput {
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
  return where;
}

export async function getPaginatedPayments(filters: PaymentListFilters) {
  const { page, pageSize, ...searchFilters } = filters;
  const where = buildPaymentWhere(searchFilters);
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

// Caps how many rows a single export query pulls into server memory. There
// is no streaming writer in this app (see lib/xlsx-writer.ts/csv-writer.ts
// — both build a whole file in memory, matching the simplicity of every
// other document-generation path here), so an unbounded export is capped
// rather than risking an unbounded query for a business with a very large
// payment history; getPaymentsForExport reports whether it was truncated
// so the caller can say so rather than silently dropping rows.
export const EXPORT_ROW_CAP = 5000;

export async function getPaymentsForExport(filters: PaymentSearchFilters) {
  const where = buildPaymentWhere(filters);
  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { order: { include: { customer: true, quotation: true } }, recordedBy: true },
      orderBy: { createdAt: "desc" },
      take: EXPORT_ROW_CAP,
    }),
    prisma.payment.count({ where }),
  ]);
  return { payments, total, truncated: total > EXPORT_ROW_CAP };
}

export type PaymentExportRow = Awaited<ReturnType<typeof getPaymentsForExport>>["payments"][number];

/**
 * "Summary only" export mode — reuses buildPaymentWhere so the summary is
 * scoped by the exact same filters as the table/other export modes, and
 * uses Prisma's own groupBy/aggregate rather than a second hand-rolled
 * totals calculation (the same "one authoritative definition" principle
 * getPaymentsSummary above already follows for the dashboard cards).
 */
export async function getPaymentsExportSummary(filters: PaymentSearchFilters) {
  const where = buildPaymentWhere(filters);
  const [overall, byStatus, byMethod] = await Promise.all([
    prisma.payment.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["status"], where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["method"], where, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  return {
    overall: { count: overall._count._all, total: Number(overall._sum.amount ?? 0) },
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all, total: Number(s._sum.amount ?? 0) })),
    byMethod: byMethod.map((m) => ({ method: m.method, count: m._count._all, total: Number(m._sum.amount ?? 0) })),
  };
}
