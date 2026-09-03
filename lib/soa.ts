import { prisma } from "@/lib/prisma";

export type SoaPeriodSelection =
  | { type: "monthly"; month: number; year: number }
  | { type: "custom"; startDate: string; endDate: string };

/** Monthly: a selected month/year -> [1st, next-1st). Custom: an inclusive date range -> [start, end+1 day), so a same-day range still covers that whole day. */
export function resolveSoaPeriod(sel: SoaPeriodSelection): { start: Date; end: Date; label: string } {
  if (sel.type === "monthly") {
    const start = new Date(sel.year, sel.month - 1, 1);
    const end = new Date(sel.year, sel.month, 1);
    return { start, end, label: start.toLocaleDateString("en-PH", { year: "numeric", month: "long" }) };
  }
  const start = new Date(sel.startDate + "T00:00:00");
  const endInclusive = new Date(sel.endDate + "T00:00:00");
  const end = new Date(endInclusive.getFullYear(), endInclusive.getMonth(), endInclusive.getDate() + 1);
  const label = `${start.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} – ${endInclusive.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
  return { start, end, label };
}

export type SoaTransactionRow = {
  date: Date;
  reference: string;
  type: "ORDER" | "PAYMENT" | "ADJUSTMENT";
  description: string;
  charge: number;
  payment: number;
  runningBalance: number;
};

export type SoaComputation = {
  openingBalance: number;
  totalCharges: number;
  totalPayments: number;
  adjustments: number;
  outstandingBalance: number;
  rows: SoaTransactionRow[];
};

/**
 * The single source of truth for Statement of Account numbers — reuses the
 * exact same Order/Payment/AccountAdjustment records (and the same
 * CONFIRMED-payment semantics) as lib/workflow.ts's paymentSummary() and
 * the Admin dashboard, not a parallel calculation system. An Order IS the
 * "charge"/invoice event in this app (see the existing Invoice document,
 * which renders an Order) — there is no separate Invoice ledger entry to
 * read from. CANCELLED orders never contribute a charge.
 *
 * Opening balance is derived, not stored: sum of everything before
 * periodStart. The transaction table itself is always recomputed live at
 * render time — nothing about a past statement's *rows* is persisted,
 * only its summary totals (see the StatementOfAccount model) — so it never
 * drifts from the real ledger.
 */
export async function computeStatementOfAccount(
  customerId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<SoaComputation> {
  const [ordersBefore, paymentsBefore, adjustmentsBefore, ordersInRange, paymentsInRange, adjustmentsInRange] =
    await Promise.all([
      prisma.order.findMany({
        where: { customerId, orderDate: { lt: periodStart }, status: { not: "CANCELLED" } },
        select: { totalAmount: true },
      }),
      prisma.payment.findMany({
        where: { status: "CONFIRMED", paymentDate: { lt: periodStart }, order: { customerId } },
        select: { amount: true },
      }),
      prisma.accountAdjustment.findMany({
        where: { customerId, createdAt: { lt: periodStart } },
        select: { type: true, amount: true },
      }),
      prisma.order.findMany({
        where: { customerId, orderDate: { gte: periodStart, lt: periodEnd }, status: { not: "CANCELLED" } },
        orderBy: { orderDate: "asc" },
      }),
      prisma.payment.findMany({
        where: { status: "CONFIRMED", paymentDate: { gte: periodStart, lt: periodEnd }, order: { customerId } },
        include: { order: { select: { orderNumber: true } } },
        orderBy: { paymentDate: "asc" },
      }),
      prisma.accountAdjustment.findMany({
        where: { customerId, createdAt: { gte: periodStart, lt: periodEnd } },
        include: { order: { select: { orderNumber: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const netAdjustments = (rows: { type: "CHARGE" | "CREDIT"; amount: unknown }[]) =>
    rows.reduce((sum, a) => sum + (a.type === "CHARGE" ? Number(a.amount) : -Number(a.amount)), 0);

  const chargesBefore = ordersBefore.reduce((s, o) => s + Number(o.totalAmount), 0);
  const paymentsBeforeSum = paymentsBefore.reduce((s, p) => s + Number(p.amount), 0);
  const openingBalance = chargesBefore - paymentsBeforeSum + netAdjustments(adjustmentsBefore);

  const totalCharges = ordersInRange.reduce((s, o) => s + Number(o.totalAmount), 0);
  const totalPayments = paymentsInRange.reduce((s, p) => s + Number(p.amount), 0);
  const adjustments = netAdjustments(adjustmentsInRange);
  const outstandingBalance = openingBalance + totalCharges - totalPayments + adjustments;

  type RawRow = { date: Date; reference: string; type: SoaTransactionRow["type"]; description: string; charge: number; payment: number };
  const raw: RawRow[] = [
    ...ordersInRange.map((o) => ({
      date: o.orderDate,
      reference: o.orderNumber,
      type: "ORDER" as const,
      description: `Order ${o.orderNumber}`,
      charge: Number(o.totalAmount),
      payment: 0,
    })),
    ...paymentsInRange.map((p) => ({
      date: p.paymentDate,
      reference: p.referenceNumber || `PAY-${p.id.slice(-6).toUpperCase()}`,
      type: "PAYMENT" as const,
      description: `Payment — ${p.method.replace(/_/g, " ")} (${p.order.orderNumber})`,
      charge: 0,
      payment: Number(p.amount),
    })),
    ...adjustmentsInRange.map((a) => ({
      date: a.createdAt,
      reference: a.order?.orderNumber ?? "ADJUSTMENT",
      type: "ADJUSTMENT" as const,
      description: a.description,
      charge: a.type === "CHARGE" ? Number(a.amount) : 0,
      payment: a.type === "CREDIT" ? Number(a.amount) : 0,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = openingBalance;
  const rows: SoaTransactionRow[] = raw.map((r) => {
    running += r.charge - r.payment;
    return { ...r, runningBalance: running };
  });

  return { openingBalance, totalCharges, totalPayments, adjustments, outstandingBalance, rows };
}

export type SoaBalanceStatus = "CURRENT" | "DUE" | "OVERDUE";

/**
 * Never OVERDUE without an actual due date that has actually passed — per
 * the spec's explicit rule. An order with no dueDate set simply can't be
 * DUE or OVERDUE, only CURRENT (a balance exists, but nothing says when
 * it's expected).
 */
export function deriveSoaBalanceStatus(orders: { dueDate: Date | null }[]): SoaBalanceStatus {
  const now = Date.now();
  if (orders.some((o) => o.dueDate && o.dueDate.getTime() < now)) return "OVERDUE";
  if (orders.some((o) => o.dueDate)) return "DUE";
  return "CURRENT";
}

/** Every customer with a nonzero outstanding balance as of `asOf` — the source list for the Monthly SOA management dashboard. */
export async function findCustomersWithOutstandingBalance(asOf: Date) {
  const orders = await prisma.order.findMany({
    where: { orderDate: { lt: asOf }, status: { not: "CANCELLED" } },
    include: {
      customer: true,
      payments: { where: { status: "CONFIRMED", paymentDate: { lt: asOf } } },
    },
  });
  const adjustments = await prisma.accountAdjustment.findMany({ where: { createdAt: { lt: asOf } } });

  const byCustomer = new Map<
    string,
    {
      customer: (typeof orders)[number]["customer"];
      balance: number;
      overdueAmount: number;
      dueDates: (Date | null)[];
      lastPaymentDate: Date | null;
    }
  >();

  for (const o of orders) {
    const entry = byCustomer.get(o.customerId) ?? {
      customer: o.customer,
      balance: 0,
      overdueAmount: 0,
      dueDates: [],
      lastPaymentDate: null,
    };
    const paid = o.payments.reduce((s, p) => s + Number(p.amount), 0);
    const orderBalance = Number(o.totalAmount) - paid;
    entry.balance += orderBalance;
    if (o.dueDate && o.dueDate.getTime() < asOf.getTime() && orderBalance > 0) {
      entry.overdueAmount += orderBalance;
    }
    entry.dueDates.push(o.dueDate);
    for (const p of o.payments) {
      if (!entry.lastPaymentDate || p.paymentDate > entry.lastPaymentDate) entry.lastPaymentDate = p.paymentDate;
    }
    byCustomer.set(o.customerId, entry);
  }

  for (const a of adjustments) {
    const entry = byCustomer.get(a.customerId);
    if (!entry) continue;
    entry.balance += a.type === "CHARGE" ? Number(a.amount) : -Number(a.amount);
  }

  return Array.from(byCustomer.values())
    .filter((e) => e.balance > 0.01)
    .map((e) => ({
      customer: e.customer,
      outstandingBalance: e.balance,
      lastPaymentDate: e.lastPaymentDate,
      balanceStatus: deriveSoaBalanceStatus(e.dueDates.map((d) => ({ dueDate: d }))),
      overdueAmount: e.overdueAmount,
    }))
    .sort((a, b) => b.outstandingBalance - a.outstandingBalance);
}
