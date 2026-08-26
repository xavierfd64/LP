import { prisma } from "@/lib/prisma";

export type PeriodType = "daily" | "monthly" | "quarterly" | "semiannual" | "annual";

export type PeriodSelection = {
  type: PeriodType;
  /** YYYY-MM-DD, used by "daily" */
  date?: string;
  /** YYYY-MM, used by "monthly" */
  month?: string;
  /** Calendar year, used by quarterly/semiannual/annual */
  year?: number;
  /** 1-4, used by "quarterly" */
  quarter?: number;
  /** 1-2, used by "semiannual" */
  half?: number;
};

export type PeriodRange = { start: Date; end: Date; label: string };

/**
 * Parses the period-related searchParams shared by every period-filtered
 * report page (Transaction Summary, and — Aug 20 1st update — Profit &
 * Loss) into a PeriodSelection. One parser, so both reports interpret
 * `?type=&date=&month=&year=&quarter=&half=` identically.
 */
export function parsePeriodSearchParams(sp: Record<string, string | string[] | undefined>) {
  const type = (typeof sp.type === "string" ? sp.type : "monthly") as PeriodType;
  const now = new Date();
  return {
    type,
    date: typeof sp.date === "string" ? sp.date : now.toISOString().slice(0, 10),
    month: typeof sp.month === "string" ? sp.month : now.toISOString().slice(0, 7),
    year: typeof sp.year === "string" ? Number(sp.year) : now.getFullYear(),
    quarter: typeof sp.quarter === "string" ? Number(sp.quarter) : Math.floor(now.getMonth() / 3) + 1,
    half: typeof sp.half === "string" ? Number(sp.half) : now.getMonth() < 6 ? 1 : 2,
  };
}

const QUARTER_LABEL = ["Q1", "Q2", "Q3", "Q4"];
const HALF_LABEL = ["First Half", "Second Half"];

/** Resolves a period selection into a concrete [start, end) date range plus a human label — the single source of truth every period-based report reads from. */
export function resolvePeriodRange(sel: PeriodSelection): PeriodRange {
  const now = new Date();

  switch (sel.type) {
    case "daily": {
      const d = sel.date ? new Date(sel.date + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      return { start, end, label: start.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) };
    }
    case "monthly": {
      const [y, m] = (sel.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
        .split("-")
        .map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 1);
      return { start, end, label: start.toLocaleDateString("en-PH", { year: "numeric", month: "long" }) };
    }
    case "quarterly": {
      const year = sel.year ?? now.getFullYear();
      const quarter = sel.quarter && sel.quarter >= 1 && sel.quarter <= 4 ? sel.quarter : Math.floor(now.getMonth() / 3) + 1;
      const start = new Date(year, (quarter - 1) * 3, 1);
      const end = new Date(year, quarter * 3, 1);
      return { start, end, label: `${QUARTER_LABEL[quarter - 1]} ${year}` };
    }
    case "semiannual": {
      const year = sel.year ?? now.getFullYear();
      const half = sel.half === 2 ? 2 : 1;
      const start = new Date(year, half === 1 ? 0 : 6, 1);
      const end = new Date(year, half === 1 ? 6 : 12, 1);
      return { start, end, label: `${HALF_LABEL[half - 1]} ${year}` };
    }
    case "annual": {
      const year = sel.year ?? now.getFullYear();
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      return { start, end, label: String(year) };
    }
  }
}

export type TransactionSummaryMetrics = {
  totalInquiries: number;
  totalQuotations: number;
  totalOrders: number;
  totalInvoices: number;
  totalPayments: number;
  salesRevenue: number;
  outstandingBalance: number;
  cancelled: number;
  completed: number;
  ordersByStatus: { status: string; count: number }[];
  paymentsByMethod: { method: string; total: number }[];
};

/**
 * Every count/sum here reuses the same Prisma models and payment-status
 * semantics (CONFIRMED = counted revenue) already used by the Admin
 * dashboard and lib/workflow.ts's paymentSummary() — no parallel
 * calculation system, just re-scoped to an arbitrary [start, end) range.
 */
export async function computeTransactionSummary(range: PeriodRange): Promise<TransactionSummaryMetrics> {
  const { start, end } = range;
  const createdInRange = { createdAt: { gte: start, lt: end } };

  const [
    totalInquiries,
    totalQuotations,
    ordersInRange,
    invoicedOrderIds,
    paymentsInRange,
    revenueAgg,
    cancelled,
    completed,
    ordersByStatusRaw,
    paymentsByMethodRaw,
  ] = await Promise.all([
    prisma.inquiry.count({ where: createdInRange }),
    prisma.quotation.count({ where: createdInRange }),
    prisma.order.findMany({
      where: createdInRange,
      include: { payments: { where: { status: "CONFIRMED" } } },
    }),
    prisma.payment.findMany({
      where: { paymentDate: { gte: start, lt: end } },
      select: { orderId: true },
      distinct: ["orderId"],
    }),
    prisma.payment.count({ where: { paymentDate: { gte: start, lt: end } } }),
    prisma.payment.aggregate({
      where: { status: "CONFIRMED", paymentDate: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.order.count({ where: { status: "CANCELLED", updatedAt: { gte: start, lt: end } } }),
    prisma.order.count({ where: { status: "COMPLETED", completedAt: { gte: start, lt: end } } }),
    prisma.order.groupBy({ by: ["status"], where: createdInRange, _count: { _all: true } }),
    prisma.payment.groupBy({
      by: ["method"],
      where: { status: "CONFIRMED", paymentDate: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
  ]);

  // A COMPLETED order can still carry an unpaid balance (e.g. released
  // under an authorized payment-bypass exception) — only CANCELLED is
  // excluded from receivables, matching lib/soa.ts's
  // findCustomersWithOutstandingBalance and lib/dashboard-data.ts's
  // getPrimaryKpis.
  const outstandingBalance = ordersInRange
    .filter((o) => o.status !== "CANCELLED")
    .reduce((sum, o) => {
      const confirmed = o.payments.reduce((s, p) => s + Number(p.amount), 0);
      return sum + Math.max(Number(o.totalAmount) - confirmed, 0);
    }, 0);

  return {
    totalInquiries,
    totalQuotations,
    totalOrders: ordersInRange.length,
    totalInvoices: invoicedOrderIds.length,
    totalPayments: paymentsInRange,
    salesRevenue: Number(revenueAgg._sum.amount ?? 0),
    outstandingBalance,
    cancelled,
    completed,
    ordersByStatus: ordersByStatusRaw.map((s) => ({ status: s.status, count: s._count._all })),
    paymentsByMethod: paymentsByMethodRaw.map((p) => ({ method: p.method, total: Number(p._sum.amount ?? 0) })),
  };
}
