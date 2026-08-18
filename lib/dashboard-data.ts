import { prisma } from "@/lib/prisma";
import { findCustomersWithOutstandingBalance, type SoaBalanceStatus } from "@/lib/soa";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Primary KPI row (spec item 11) — the handful of numbers that matter most,
 * not a wall of equal-weight tiles. Reuses the same "confirmed payment"
 * and "outstanding balance" definitions already used everywhere else in
 * the app (lib/workflow.ts's paymentSummary logic, applied per-order here)
 * rather than a second financial calculation.
 */
export async function getPrimaryKpis() {
  const today = startOfToday();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  const [todaySales, yesterdaySales, openOrders, inProductionCount, pendingPayments, newInquiries] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "CONFIRMED", paymentDate: { gte: today } }, _sum: { amount: true } }),
    prisma.payment.aggregate({
      where: { status: "CONFIRMED", paymentDate: { gte: yesterday, lt: today } },
      _sum: { amount: true },
    }),
    prisma.order.count({ where: { status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
    prisma.order.count({ where: { status: "IN_PRODUCTION" } }),
    prisma.payment.aggregate({ where: { status: "PENDING" }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.inquiry.count({ where: { status: "NEW", createdAt: { gte: today } } }),
  ]);

  const openOrdersWithBalance = await prisma.order.findMany({
    where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
    include: { payments: { where: { status: "CONFIRMED" } } },
  });
  const outstandingBalance = openOrdersWithBalance.reduce((sum, o) => {
    const confirmed = o.payments.reduce((s, p) => s + Number(p.amount), 0);
    return sum + Math.max(Number(o.totalAmount) - confirmed, 0);
  }, 0);
  const outstandingCustomerCount = new Set(
    openOrdersWithBalance
      .filter((o) => Number(o.totalAmount) - o.payments.reduce((s, p) => s + Number(p.amount), 0) > 0)
      .map((o) => o.customerId)
  ).size;

  const todaySalesTotal = Number(todaySales._sum.amount ?? 0);
  const yesterdaySalesTotal = Number(yesterdaySales._sum.amount ?? 0);
  const salesChangePct = yesterdaySalesTotal > 0 ? Math.round(((todaySalesTotal - yesterdaySalesTotal) / yesterdaySalesTotal) * 100) : null;

  return {
    todaySales: todaySalesTotal,
    salesChangePct,
    outstandingBalance,
    outstandingCustomerCount,
    openOrders,
    inProductionCount,
    pendingPaymentsCount: pendingPayments._count._all,
    pendingPaymentsAmount: Number(pendingPayments._sum.amount ?? 0),
    newInquiries,
  };
}

export type NeedsAttentionItem = { label: string; count: number; href: string; tone: "red" | "yellow" };

/** Spec item 13 — every item here is real, live data; never a placeholder count. */
export async function getNeedsAttention(): Promise<NeedsAttentionItem[]> {
  const today = startOfToday();

  const [openOrdersRaw, quotationsAwaiting, delayedJobOrders, lowStockCount] = await Promise.all([
    prisma.order.findMany({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      select: { id: true, totalAmount: true, payments: { where: { status: "CONFIRMED" }, select: { amount: true } } },
    }),
    prisma.quotation.count({ where: { status: "SENT" } }),
    prisma.jobOrder.count({ where: { status: { in: ["IN_PROGRESS", "REWORK", "QC"] }, deadline: { lt: today } } }),
    prisma.inventoryItem.findMany({ select: { currentQty: true, reorderThreshold: true } }).then((items) =>
      items.filter((i) => i.currentQty <= i.reorderThreshold).length
    ),
  ]);

  const ordersAwaitingPayment = openOrdersRaw.filter((o) => {
    const confirmed = o.payments.reduce((s, p) => s + Number(p.amount), 0);
    return Number(o.totalAmount) - confirmed > 0;
  }).length;
  // Only counts orders with a real dueDate that has actually passed and
  // still carry a balance — never a synthetic aging window (spec item 16).
  const overdueOrders = await prisma.order.findMany({
    where: { status: { notIn: ["COMPLETED", "CANCELLED"] }, dueDate: { lt: today } },
    select: { id: true, totalAmount: true, payments: { where: { status: "CONFIRMED" }, select: { amount: true } } },
  });
  const overduePaymentsCount = overdueOrders.filter((o) => Number(o.totalAmount) - o.payments.reduce((s, p) => s + Number(p.amount), 0) > 0).length;

  const items: NeedsAttentionItem[] = [];
  if (overduePaymentsCount > 0) items.push({ label: `${overduePaymentsCount} overdue payment${overduePaymentsCount === 1 ? "" : "s"}`, count: overduePaymentsCount, href: "/payments", tone: "red" });
  if (quotationsAwaiting > 0) items.push({ label: `${quotationsAwaiting} quotation${quotationsAwaiting === 1 ? "" : "s"} awaiting approval`, count: quotationsAwaiting, href: "/quotations", tone: "yellow" });
  if (ordersAwaitingPayment > 0) items.push({ label: `${ordersAwaitingPayment} order${ordersAwaitingPayment === 1 ? "" : "s"} awaiting payment`, count: ordersAwaitingPayment, href: "/payments", tone: "yellow" });
  if (delayedJobOrders > 0) items.push({ label: `${delayedJobOrders} production job${delayedJobOrders === 1 ? "" : "s"} delayed`, count: delayedJobOrders, href: "/production", tone: "red" });
  if (lowStockCount > 0) items.push({ label: `${lowStockCount} low-stock material${lowStockCount === 1 ? "" : "s"}`, count: lowStockCount, href: "/inventory", tone: "yellow" });
  return items;
}

export type FinancialPeriod = "today" | "week" | "month" | "quarter" | "semiannual" | "year";

/** Spec item 14 — reuses the exact chart components already built for the Revenue & Orders Trend card; only the bucketing changes per period. */
export async function getFinancialOverview(period: FinancialPeriod) {
  const now = new Date();
  const bucketCount = period === "today" ? 24 : period === "week" ? 7 : period === "month" ? 4 : period === "quarter" ? 3 : period === "semiannual" ? 6 : 12;
  const bucketUnit: "hour" | "day" | "week" | "month" = period === "today" ? "hour" : period === "week" ? "day" : period === "month" ? "week" : "month";

  function bucketStart(offsetFromNow: number): Date {
    if (bucketUnit === "hour") return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - offsetFromNow);
    if (bucketUnit === "day") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetFromNow);
    if (bucketUnit === "week") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetFromNow * 7);
    return new Date(now.getFullYear(), now.getMonth() - offsetFromNow, 1);
  }
  function bucketLabel(start: Date): string {
    if (bucketUnit === "hour") return start.toLocaleTimeString("en-US", { hour: "numeric" });
    if (bucketUnit === "day") return start.toLocaleDateString("en-US", { weekday: "short" });
    if (bucketUnit === "week") return `Wk of ${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    return start.toLocaleDateString("en-US", { month: "short" });
  }

  const buckets = Array.from({ length: bucketCount }, (_, i) => {
    const offset = bucketCount - 1 - i;
    const start = bucketStart(offset);
    const end = bucketStart(offset - 1);
    return { label: bucketLabel(start), start, end };
  });
  const rangeStart = buckets[0].start;

  const [payments, orders] = await Promise.all([
    prisma.payment.findMany({ where: { status: "CONFIRMED", paymentDate: { gte: rangeStart } }, select: { paymentDate: true, amount: true } }),
    prisma.order.findMany({ where: { createdAt: { gte: rangeStart } }, select: { createdAt: true } }),
  ]);

  const data = buckets.map((b) => ({
    month: b.label,
    revenue: payments.filter((p) => p.paymentDate >= b.start && p.paymentDate < b.end).reduce((sum, p) => sum + Number(p.amount), 0),
    orders: orders.filter((o) => o.createdAt >= b.start && o.createdAt < b.end).length,
  }));

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalOrders = data.reduce((s, d) => s + d.orders, 0);
  return { data, totalRevenue, totalOrders };
}

export type ReceivableRow = {
  customerId: string;
  customerName: string;
  balance: number;
  status: SoaBalanceStatus;
};

/** Spec items 15/16 — reuses findCustomersWithOutstandingBalance and its deriveSoaBalanceStatus (the exact same SOA balance/overdue calculation) rather than a second one. */
export async function getReceivablesRequiringAttention(limit = 6): Promise<ReceivableRow[]> {
  const rows = await findCustomersWithOutstandingBalance(new Date());
  return rows
    .map((r) => ({ customerId: r.customer.id, customerName: r.customer.name, balance: r.outstandingBalance, status: r.balanceStatus }))
    .sort((a, b) => (a.status === "OVERDUE" ? -1 : 1) - (b.status === "OVERDUE" ? -1 : 1) || b.balance - a.balance)
    .slice(0, limit);
}

export type ReceivableTransactionRow = {
  id: string;
  type: "Invoice";
  reference: string;
  date: Date;
  dueDate: Date | null;
  total: number;
  paid: number;
  outstanding: number;
  status: "UNPAID" | "PARTIALLY_PAID" | "OVERDUE";
  href: string;
};

export type ReceivableRecentPayment = {
  id: string;
  reference: string;
  date: Date;
  amount: number;
  method: string;
  status: string;
};

export type ReceivableDetails = {
  customer: { id: string; name: string; displayId: string; contactNumber: string | null; email: string | null };
  totalOutstanding: number;
  current: number;
  due: number;
  overdue: number;
  status: SoaBalanceStatus;
  transactions: ReceivableTransactionRow[];
  recentPayments: ReceivableRecentPayment[];
};

/**
 * Backs the Receivable Details modal (9th update) — the "why is this
 * customer on the Receivables list" drill-down. `totalOutstanding`,
 * `overdue`, and `status` are read directly off the exact same
 * findCustomersWithOutstandingBalance() entry the Receivables card itself
 * used to decide this customer belongs on the list at all (spec item 6:
 * "the amounts must remain consistent throughout the system") — never
 * recomputed. `current`/`due` are derived by subtraction from that same
 * `overdue` figure and a per-order due-date bucketing, so the three
 * buckets always sum to exactly `totalOutstanding` by construction, even
 * if a manual AccountAdjustment (which the aggregate total includes but
 * has no due date of its own) is part of the balance.
 */
export async function getReceivableDetails(customerId: string): Promise<ReceivableDetails | null> {
  const [customer, balances] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, displayId: true, contactNumber: true, email: true },
    }),
    findCustomersWithOutstandingBalance(new Date()),
  ]);
  if (!customer) return null;

  const entry = balances.find((b) => b.customer.id === customerId);
  const recentPayments = await getRecentPaymentsForCustomer(customerId);

  if (!entry) {
    // Balance was likely just paid off between the dashboard load and opening this modal — show the honest current state rather than stale numbers.
    return { customer, totalOutstanding: 0, current: 0, due: 0, overdue: 0, status: "CURRENT", transactions: [], recentPayments };
  }

  const orders = await prisma.order.findMany({
    where: { customerId, status: { not: "CANCELLED" } },
    include: { payments: { where: { status: "CONFIRMED" } } },
    orderBy: { createdAt: "desc" },
  });

  const now = Date.now();
  let due = 0;
  const transactions: ReceivableTransactionRow[] = [];
  for (const o of orders) {
    const paid = o.payments.reduce((s, p) => s + Number(p.amount), 0);
    const total = Number(o.totalAmount);
    const outstanding = total - paid;
    if (outstanding <= 0.01) continue;
    const isOverdue = !!(o.dueDate && o.dueDate.getTime() < now);
    if (o.dueDate && !isOverdue) due += outstanding;
    transactions.push({
      id: o.id,
      type: "Invoice",
      reference: o.orderNumber,
      date: o.createdAt,
      dueDate: o.dueDate,
      total,
      paid,
      outstanding,
      status: isOverdue ? "OVERDUE" : paid > 0 ? "PARTIALLY_PAID" : "UNPAID",
      href: `/orders/${o.id}`,
    });
  }

  const overdue = entry.overdueAmount;
  const current = Math.max(entry.outstandingBalance - overdue - due, 0);

  return {
    customer,
    totalOutstanding: entry.outstandingBalance,
    current,
    due,
    overdue,
    status: entry.balanceStatus,
    transactions,
    recentPayments,
  };
}

async function getRecentPaymentsForCustomer(customerId: string, limit = 5): Promise<ReceivableRecentPayment[]> {
  const payments = await prisma.payment.findMany({
    where: { order: { customerId } },
    orderBy: { paymentDate: "desc" },
    take: limit,
  });
  return payments.map((p) => ({
    id: p.id,
    reference: p.referenceNumber || `PAY-${p.id.slice(-6).toUpperCase()}`,
    date: p.paymentDate,
    amount: Number(p.amount),
    method: p.method,
    status: p.status,
  }));
}

export type ProductionStageCount = { stage: string; count: number };

/** Spec item 17 — the exact same "union of configured active WorkflowTemplate stages, in first-seen order" derivation the Production Kanban itself uses (app/(app)/production/page.tsx), never a hard-coded stage list. */
export async function getProductionToday(): Promise<ProductionStageCount[]> {
  const [jobOrders, templates] = await Promise.all([
    prisma.jobOrder.findMany({
      where: { status: { in: ["IN_PROGRESS", "REWORK", "QC", "READY"] } },
      include: { stageLogs: { orderBy: { createdAt: "desc" } } },
    }),
    prisma.workflowTemplate.findMany({ where: { active: true }, include: { stages: { orderBy: { order: "asc" } } } }),
  ]);

  const READY_COLUMN = "Ready for Fulfillment";
  const columnNames: string[] = [];
  for (const t of templates) {
    for (const s of t.stages) {
      if (!columnNames.includes(s.name)) columnNames.push(s.name);
    }
  }
  columnNames.push(READY_COLUMN);

  const counts = new Map(columnNames.map((c) => [c, 0]));
  for (const jo of jobOrders) {
    const currentLog = jo.stageLogs.find((l) => l.stageOrder === jo.currentStageOrder && l.status !== "COMPLETED");
    const column = jo.status === "READY" ? READY_COLUMN : currentLog?.stageName ?? READY_COLUMN;
    counts.set(column, (counts.get(column) ?? 0) + 1);
  }
  return columnNames.map((stage) => ({ stage, count: counts.get(stage) ?? 0 })).filter((c) => c.count > 0);
}

export type ActivityRow = {
  id: string;
  time: Date;
  customer: string;
  transaction: "Inquiry" | "Quotation" | "Job Order" | "Payment";
  reference: string;
  amount: number | null;
  status: string;
  href: string;
};

/** Spec item 19 — real records only, each linking to its existing detail page (never a synthetic activity-log entity). */
export async function getTodaysActivity(limit = 10): Promise<ActivityRow[]> {
  const today = startOfToday();

  const [inquiries, quotations, jobOrders, payments] = await Promise.all([
    prisma.inquiry.findMany({ where: { createdAt: { gte: today } }, include: { customer: true } }),
    prisma.quotation.findMany({ where: { createdAt: { gte: today } }, include: { customer: true } }),
    prisma.jobOrder.findMany({ where: { createdAt: { gte: today } }, include: { order: { include: { customer: true } } } }),
    prisma.payment.findMany({ where: { createdAt: { gte: today } }, include: { order: { include: { customer: true } } } }),
  ]);

  const rows: ActivityRow[] = [
    ...inquiries.map((i) => ({ id: `inq-${i.id}`, time: i.createdAt, customer: i.customer.name, transaction: "Inquiry" as const, reference: i.desiredProduct, amount: null, status: i.status, href: `/inquiries/${i.id}` })),
    ...quotations.map((q) => ({ id: `quo-${q.id}`, time: q.createdAt, customer: q.customer.name, transaction: "Quotation" as const, reference: q.quoteNumber, amount: Number(q.total), status: q.status, href: `/quotations/${q.id}` })),
    ...jobOrders.map((j) => ({ id: `jo-${j.id}`, time: j.createdAt, customer: j.order.customer.name, transaction: "Job Order" as const, reference: j.joNumber, amount: null, status: j.status, href: `/job-orders/${j.id}` })),
    ...payments.map((p) => ({ id: `pay-${p.id}`, time: p.createdAt, customer: p.order.customer.name, transaction: "Payment" as const, reference: p.order.orderNumber, amount: Number(p.amount), status: p.status, href: `/orders/${p.orderId}` })),
  ];

  return rows.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, limit);
}

export type UpcomingFulfillmentBucket = { label: string; count: number };

/** Spec item 20 — compact date-bucketed summary rather than the large mostly-empty list the old dashboard showed. */
export async function getUpcomingFulfillments(): Promise<UpcomingFulfillmentBucket[]> {
  const fulfillments = await prisma.fulfillment.findMany({
    where: { status: { in: ["SCHEDULED", "BOOKED", "IN_TRANSIT"] }, scheduledDate: { not: null } },
    select: { scheduledDate: true },
  });

  const today = startOfToday();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const buckets = new Map<string, number>();
  for (const f of fulfillments) {
    if (!f.scheduledDate) continue;
    const d = new Date(f.scheduledDate);
    d.setHours(0, 0, 0, 0);
    const label = d.getTime() === tomorrow.getTime() ? "Tomorrow" : d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .map(([label, count]) => ({ label, count }))
    .slice(0, 5);
}

/** Spec item 12 — secondary metrics that shouldn't compete with the primary KPI row. */
export async function getBusinessInsights() {
  const monthStart = startOfMonth();

  const [qcResults, lowStockItems, newCustomersThisMonth, ordersThisMonthCustomerIds, rewardEarnedAgg, rewardRedeemedAgg] = await Promise.all([
    prisma.qCResult.groupBy({ by: ["result"], _count: { _all: true } }),
    prisma.inventoryItem.findMany({ select: { currentQty: true, reorderThreshold: true } }).then((items) => items.filter((i) => i.currentQty <= i.reorderThreshold).length),
    prisma.customer.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.order.findMany({ where: { createdAt: { gte: monthStart } }, select: { customerId: true }, distinct: ["customerId"] }),
    prisma.rewardTransaction.aggregate({ where: { type: "EARN", createdAt: { gte: monthStart } }, _sum: { points: true } }),
    prisma.rewardTransaction.aggregate({ where: { type: "REDEEM", createdAt: { gte: monthStart } }, _sum: { points: true } }),
  ]);

  const qcPass = qcResults.find((r) => r.result === "PASS")?._count._all ?? 0;
  const qcFail = qcResults.find((r) => r.result === "FAIL")?._count._all ?? 0;
  const qcTotal = qcPass + qcFail;

  return {
    qcPassRate: qcTotal > 0 ? Math.round((qcPass / qcTotal) * 100) : null,
    qcPass,
    qcFail,
    lowStockItems,
    newCustomersThisMonth,
    returningCustomersThisMonth: Math.max(ordersThisMonthCustomerIds.length - newCustomersThisMonth, 0),
    pointsIssued: rewardEarnedAgg._sum.points ?? 0,
    pointsRedeemed: Math.abs(rewardRedeemedAgg._sum.points ?? 0),
  };
}

/** The original fixed last-6-months revenue/orders trend (spec item 22 — "keep the existing... functionality"), independent of the new period-selectable Financial Overview card above. */
export async function getRevenueTrend6Months() {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const offset = 5 - i;
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    return { label: start.toLocaleDateString("en-US", { month: "short" }), start, end };
  });
  const rangeStart = months[0].start;

  const [payments, orders] = await Promise.all([
    prisma.payment.findMany({ where: { status: "CONFIRMED", paymentDate: { gte: rangeStart } }, select: { paymentDate: true, amount: true } }),
    prisma.order.findMany({ where: { createdAt: { gte: rangeStart } }, select: { createdAt: true } }),
  ]);

  return months.map((m) => ({
    month: m.label,
    revenue: payments.filter((p) => p.paymentDate >= m.start && p.paymentDate < m.end).reduce((sum, p) => sum + Number(p.amount), 0),
    orders: orders.filter((o) => o.createdAt >= m.start && o.createdAt < m.end).length,
  }));
}

/** Orders-by-status + Production-status chart data — unchanged from the previous dashboard, just relocated here alongside the rest of the dashboard queries. */
export async function getStatusCharts() {
  const [ordersByStatusRaw, jobOrdersByStatus] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.jobOrder.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return {
    ordersByStatus: ordersByStatusRaw.map((s) => ({ status: s.status, count: s._count._all })),
    productionStatus: jobOrdersByStatus.map((s) => ({ status: s.status, count: s._count._all })),
  };
}
