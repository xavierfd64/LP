import { prisma } from "@/lib/prisma";
import { findCustomersWithOutstandingBalance, type SoaBalanceStatus } from "@/lib/soa";
import { computeServiceCostBreakdown, computeRecommendedSellingPrice } from "@/lib/service-costing";
import { computeFinancialFoundation } from "@/lib/financial-summary";
import { resolvePeriodRange } from "@/lib/transaction-summary";

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

  // Outstanding balance/receivables must include COMPLETED orders that
  // still carry an unpaid amount (e.g. a government/business account
  // released and completed under an authorized payment-bypass exception,
  // 3rd Update item "Government/Business Payment Bypass" — the order
  // finishing production must never make its receivable silently
  // disappear from what staff are shown). Only CANCELLED is excluded,
  // matching lib/soa.ts's findCustomersWithOutstandingBalance — the one
  // other place in the app that already computes this correctly.
  const openOrdersWithBalance = await prisma.order.findMany({
    where: { status: { not: "CANCELLED" } },
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

/**
 * Orders with a real, past dueDate that still carry a balance — never a
 * synthetic aging window (spec item 16). Extracted so getNeedsAttention()
 * and the Payments page summary (lib/payments-list.ts) share the exact
 * same "overdue" definition instead of each computing their own.
 */
export async function getOverduePaymentsCount(): Promise<number> {
  const today = startOfToday();
  // Same receivables reasoning as getPrimaryKpis' outstandingBalance above —
  // a COMPLETED order past its due date with an unpaid balance is still an
  // overdue payment staff need to collect.
  const overdueOrders = await prisma.order.findMany({
    where: { status: { not: "CANCELLED" }, dueDate: { lt: today } },
    select: { id: true, totalAmount: true, payments: { where: { status: "CONFIRMED" }, select: { amount: true } } },
  });
  return overdueOrders.filter((o) => Number(o.totalAmount) - o.payments.reduce((s, p) => s + Number(p.amount), 0) > 0).length;
}

/** Spec item 13 — every item here is real, live data; never a placeholder count. */
export async function getNeedsAttention(): Promise<NeedsAttentionItem[]> {
  const today = startOfToday();

  const [openOrdersRaw, quotationsAwaiting, delayedJobOrders, lowStockCount, overduePaymentsCount] = await Promise.all([
    // Feeds ordersAwaitingPayment below (a receivables check, not an
    // "active orders" one) — a COMPLETED order with an unpaid balance
    // must still surface here so staff know to collect it.
    prisma.order.findMany({
      where: { status: { not: "CANCELLED" } },
      select: { id: true, totalAmount: true, payments: { where: { status: "CONFIRMED" }, select: { amount: true } } },
    }),
    prisma.quotation.count({ where: { status: "SENT" } }),
    prisma.jobOrder.count({ where: { status: { in: ["IN_PROGRESS", "REWORK", "QC"] }, deadline: { lt: today }, order: { status: { not: "CANCELLED" } } } }),
    prisma.inventoryItem.findMany({ select: { currentQty: true, reorderThreshold: true } }).then((items) =>
      items.filter((i) => i.currentQty <= i.reorderThreshold).length
    ),
    getOverduePaymentsCount(),
  ]);

  const ordersAwaitingPayment = openOrdersRaw.filter((o) => {
    const confirmed = o.payments.reduce((s, p) => s + Number(p.amount), 0);
    return Number(o.totalAmount) - confirmed > 0;
  }).length;

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
    prisma.order.findMany({ where: { orderDate: { gte: rangeStart } }, select: { orderDate: true } }),
  ]);

  const data = buckets.map((b) => ({
    month: b.label,
    revenue: payments.filter((p) => p.paymentDate >= b.start && p.paymentDate < b.end).reduce((sum, p) => sum + Number(p.amount), 0),
    orders: orders.filter((o) => o.orderDate >= b.start && o.orderDate < b.end).length,
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
    orderBy: { orderDate: "desc" },
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
      date: o.orderDate,
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
      where: { status: { in: ["IN_PROGRESS", "REWORK", "QC", "READY"] }, order: { status: { not: "CANCELLED" } } },
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

/**
 * Spec item 20 — compact date-bucketed summary rather than the large
 * mostly-empty list the old dashboard showed. Aug 25 update 1: excludes
 * fulfillments on a cancelled order (a cancellation doesn't retroactively
 * touch the Fulfillment row itself, so this join is what keeps it out of
 * "Upcoming"), and only counts a scheduled date that's actually still
 * ahead — a SCHEDULED fulfillment whose date has already passed is an
 * overdue/missed fulfillment, not an "upcoming" one.
 */
export async function getUpcomingFulfillments(): Promise<UpcomingFulfillmentBucket[]> {
  const today = startOfToday();
  const fulfillments = await prisma.fulfillment.findMany({
    where: {
      status: { in: ["SCHEDULED", "BOOKED", "IN_TRANSIT"] },
      scheduledDate: { gte: today },
      order: { status: { not: "CANCELLED" } },
    },
    select: { scheduledDate: true },
  });

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
    prisma.order.findMany({ where: { orderDate: { gte: monthStart } }, select: { customerId: true }, distinct: ["customerId"] }),
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
    prisma.order.findMany({ where: { orderDate: { gte: rangeStart } }, select: { orderDate: true } }),
  ]);

  return months.map((m) => ({
    month: m.label,
    revenue: payments.filter((p) => p.paymentDate >= m.start && p.paymentDate < m.end).reduce((sum, p) => sum + Number(p.amount), 0),
    orders: orders.filter((o) => o.orderDate >= m.start && o.orderDate < m.end).length,
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

// ---------------------------------------------------------------------------
// Whiskey dashboard (Image 2 reference) — volume KPIs, weekly analytics,
// service revenue ranking, service cost breakdown, P&L, payment methods,
// stock levels, and a tabbed recent-transactions list. Every figure below
// reuses an existing authoritative calculation (the same count/sum fields
// read everywhere else, computeServiceCostBreakdown, computeFinancialFoundation)
// — never a second calculation engine for a number that already has one.

function weekBuckets(n: number) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Array.from({ length: n }, (_, i) => {
    const offsetEnd = (n - 1 - i) * 7;
    const bucketEnd = new Date(end.getTime() - offsetEnd * 24 * 60 * 60 * 1000);
    const bucketStart = new Date(bucketEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start: bucketStart, end: bucketEnd, label: bucketStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
  });
}

export type VolumeKpi = { value: number; changePct: number | null; weekly: number[] };

/**
 * The 5 "Total X" KPIs from the Whiskey dashboard reference (this-month
 * totals, vs-last-month trend %, and a 6-week sparkline series). Every
 * count/sum is the same field the rest of the app already reads —
 * Inquiry/Quotation/Order counts, confirmed Payment sum, InventoryItem
 * count — never a parallel definition of any of these.
 */
export async function getVolumeKpis(): Promise<{
  inquiries: VolumeKpi;
  quotations: VolumeKpi;
  orders: VolumeKpi;
  payments: VolumeKpi;
  inventoryItems: VolumeKpi;
}> {
  const monthStart = startOfMonth();
  const lastMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
  const weeks = weekBuckets(6);
  const earliestWeekStart = weeks[0].start;

  const [
    inquiriesThis, inquiriesLast, inquiriesWeekly,
    quotationsThis, quotationsLast, quotationsWeekly,
    ordersThis, ordersLast, ordersWeekly,
    paymentsThisAgg, paymentsLastAgg, paymentsWeekly,
    inventoryItemsAll,
  ] = await Promise.all([
    prisma.inquiry.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.inquiry.count({ where: { createdAt: { gte: lastMonthStart, lt: monthStart } } }),
    prisma.inquiry.findMany({ where: { createdAt: { gte: earliestWeekStart } }, select: { createdAt: true } }),
    prisma.quotation.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.quotation.count({ where: { createdAt: { gte: lastMonthStart, lt: monthStart } } }),
    prisma.quotation.findMany({ where: { createdAt: { gte: earliestWeekStart } }, select: { createdAt: true } }),
    prisma.order.count({ where: { orderDate: { gte: monthStart } } }),
    prisma.order.count({ where: { orderDate: { gte: lastMonthStart, lt: monthStart } } }),
    prisma.order.findMany({ where: { orderDate: { gte: earliestWeekStart } }, select: { orderDate: true } }),
    prisma.payment.aggregate({ where: { status: "CONFIRMED", paymentDate: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { status: "CONFIRMED", paymentDate: { gte: lastMonthStart, lt: monthStart } }, _sum: { amount: true } }),
    prisma.payment.findMany({ where: { status: "CONFIRMED", paymentDate: { gte: earliestWeekStart } }, select: { paymentDate: true, amount: true } }),
    prisma.inventoryItem.findMany({ select: { createdAt: true } }),
  ]);

  const pctChange = (thisVal: number, lastVal: number): number | null =>
    lastVal > 0 ? Math.round(((thisVal - lastVal) / lastVal) * 100) : thisVal > 0 ? 100 : null;
  const weeklyCounts = (dates: Date[]) => weeks.map((w) => dates.filter((d) => d >= w.start && d < w.end).length);
  const weeklySum = (rows: { date: Date; amount: number }[]) =>
    weeks.map((w) => rows.filter((r) => r.date >= w.start && r.date < w.end).reduce((s, r) => s + r.amount, 0));

  const inventoryItemsCount = inventoryItemsAll.length;
  const inventoryCountBeforeMonth = inventoryItemsAll.filter((i) => i.createdAt < monthStart).length;
  // Inventory Items is a point-in-time stock count, not a flow — its
  // sparkline tracks the running item count as of each week's end rather
  // than a per-week "volume," since that's the only honest reading of
  // "trend" for a catalog count.
  const inventoryCumulative = weeks.map((w) => inventoryItemsAll.filter((i) => i.createdAt < w.end).length);

  return {
    inquiries: { value: inquiriesThis, changePct: pctChange(inquiriesThis, inquiriesLast), weekly: weeklyCounts(inquiriesWeekly.map((r) => r.createdAt)) },
    quotations: { value: quotationsThis, changePct: pctChange(quotationsThis, quotationsLast), weekly: weeklyCounts(quotationsWeekly.map((r) => r.createdAt)) },
    orders: { value: ordersThis, changePct: pctChange(ordersThis, ordersLast), weekly: weeklyCounts(ordersWeekly.map((r) => r.orderDate)) },
    payments: {
      value: Number(paymentsThisAgg._sum.amount ?? 0),
      changePct: pctChange(Number(paymentsThisAgg._sum.amount ?? 0), Number(paymentsLastAgg._sum.amount ?? 0)),
      weekly: weeklySum(paymentsWeekly.map((p) => ({ date: p.paymentDate, amount: Number(p.amount) }))),
    },
    inventoryItems: { value: inventoryItemsCount, changePct: pctChange(inventoryItemsCount, inventoryCountBeforeMonth), weekly: inventoryCumulative },
  };
}

export type SalesOverviewWeek = { week: string; totalSales: number; payments: number; outstanding: number };

/**
 * "Sales Overview" grouped bar (Image 2) — Total Sales is each week's
 * Order totals, Payments is confirmed Payment amounts that week, and
 * Outstanding is simply their difference floored at 0. That subtraction
 * is a display-only rollup for the chart, not a new per-order balance
 * calculation — the per-order balance itself is still only ever computed
 * by lib/workflow.ts's paymentSummary, never re-derived here.
 */
export async function getSalesOverviewWeekly(weekCount = 4): Promise<SalesOverviewWeek[]> {
  const weeks = weekBuckets(weekCount);
  const earliestStart = weeks[0].start;

  const [orders, payments] = await Promise.all([
    prisma.order.findMany({ where: { orderDate: { gte: earliestStart } }, select: { orderDate: true, totalAmount: true } }),
    prisma.payment.findMany({ where: { status: "CONFIRMED", paymentDate: { gte: earliestStart } }, select: { paymentDate: true, amount: true } }),
  ]);

  return weeks.map((w) => {
    const totalSales = orders.filter((o) => o.orderDate >= w.start && o.orderDate < w.end).reduce((s, o) => s + Number(o.totalAmount), 0);
    const paid = payments.filter((p) => p.paymentDate >= w.start && p.paymentDate < w.end).reduce((s, p) => s + Number(p.amount), 0);
    return { week: w.label, totalSales, payments: paid, outstanding: Math.max(totalSales - paid, 0) };
  });
}

export type TopServiceRevenue = { serviceId: string; name: string; revenue: number };

/** "Top Services by Revenue" ranked bar (Image 2), subtitle "Based on confirmed orders" — a plain sum of real OrderLineItem qty × unitPrice, grouped by Service, for orders that were not cancelled. */
export async function getTopServicesByRevenue(limit = 5): Promise<TopServiceRevenue[]> {
  const monthStart = startOfMonth();
  const lines = await prisma.orderLineItem.findMany({
    where: { order: { status: { not: "CANCELLED" }, orderDate: { gte: monthStart } }, serviceId: { not: null } },
    select: { serviceId: true, qty: true, unitPrice: true, service: { select: { name: true } } },
  });

  const totals = new Map<string, { name: string; revenue: number }>();
  for (const line of lines) {
    if (!line.serviceId || !line.service) continue;
    const revenue = line.qty * Number(line.unitPrice);
    const existing = totals.get(line.serviceId);
    totals.set(line.serviceId, { name: line.service.name, revenue: (existing?.revenue ?? 0) + revenue });
  }

  return Array.from(totals.entries())
    .map(([serviceId, v]) => ({ serviceId, name: v.name, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export type ServiceCostBreakdownDashboard = {
  serviceName: string;
  qty: number;
  unit: string | null;
  materialCost: number;
  laborCost: number;
  overheadCost: number;
  profitMargin: number | null;
  totalEstimatedCost: number;
  suggestedPrice: number | null;
} | null;

/**
 * "Service Cost Breakdown" pie (Image 2), e.g. "Example: Tarpaulin
 * Printing (1 sqm)" — picks the highest-revenue service that actually has
 * a fully configured cost breakdown and reuses computeServiceCostBreakdown
 * (the same function the Service Costing admin page reads) rather than a
 * second costing calculation. Returns null when no service is fully
 * costed yet — never a fabricated example.
 */
export async function getServiceCostBreakdownForDashboard(): Promise<ServiceCostBreakdownDashboard> {
  const ranked = await getTopServicesByRevenue(20);
  for (const candidate of ranked) {
    const breakdown = await computeServiceCostBreakdown(candidate.serviceId, 1);
    if (breakdown.status !== "CONFIGURED" || breakdown.totalCost == null) continue;

    const service = await prisma.service.findUnique({ where: { id: candidate.serviceId }, select: { targetMarginPct: true } }).catch(() => null);
    const materialCost = breakdown.materialLines.reduce((s, l) => s + (l.amount ?? 0), 0);
    const laborCost = breakdown.componentLines.filter((l) => l.category === "LABOR").reduce((s, l) => s + (l.amount ?? 0), 0);
    const overheadCost = breakdown.componentLines.filter((l) => l.category !== "LABOR").reduce((s, l) => s + (l.amount ?? 0), 0);
    const targetMarginPct = service?.targetMarginPct != null ? Number(service.targetMarginPct) : null;
    const suggestedPrice = computeRecommendedSellingPrice(breakdown.totalCost, targetMarginPct);
    const profitMargin = suggestedPrice != null ? Math.max(suggestedPrice - breakdown.totalCost, 0) : null;

    return {
      serviceName: candidate.name,
      qty: 1,
      unit: null,
      materialCost,
      laborCost,
      overheadCost,
      profitMargin,
      totalEstimatedCost: breakdown.totalCost,
      suggestedPrice,
    };
  }
  return null;
}

export type MonthlyPL = { revenue: number; productionCost: number; operatingExpenses: number; netProfit: number | null };

/** "Monthly Profit & Loss" bar (Image 2) — reuses computeFinancialFoundation exactly, the one authoritative P&L calculation (lib/financial-summary.ts) also used by the Profit & Loss report. Production Cost is that function's real combined `cogs` figure — it is never split into Material/Labor here because the authoritative calculation doesn't split it either, and inventing that split would be a second costing engine. */
export async function getMonthlyPL(): Promise<MonthlyPL> {
  const range = resolvePeriodRange({ type: "monthly" });
  const fin = await computeFinancialFoundation(range);
  return { revenue: fin.revenue, productionCost: fin.cogs, operatingExpenses: fin.operatingExpenses, netProfit: fin.netProfit };
}

export type PaymentMethodShare = { method: string; total: number; pct: number };

/** "Payment Methods" donut (Image 2) — confirmed Payment amounts this month, grouped by the same PaymentMethod enum used everywhere else. */
export async function getPaymentMethodsBreakdown(): Promise<PaymentMethodShare[]> {
  const monthStart = startOfMonth();
  const rows = await prisma.payment.groupBy({
    by: ["method"],
    where: { status: "CONFIRMED", paymentDate: { gte: monthStart } },
    _sum: { amount: true },
  });
  const total = rows.reduce((s, r) => s + Number(r._sum.amount ?? 0), 0);
  return rows
    .map((r) => ({ method: r.method, total: Number(r._sum.amount ?? 0), pct: total > 0 ? Math.round((Number(r._sum.amount ?? 0) / total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
}

export type StockLevelRow = { id: string; sku: string; name: string; unit: string; currentQty: number; reorderThreshold: number; low: boolean };

/** "Inventory Stock Levels" table (Image 2) — the 5 real items closest to (or under) their reorder threshold, the same InventoryItem fields the Inventory page itself reads. No fabricated "category" column: InventoryItem has no category field, so it is omitted rather than invented. */
export async function getInventoryStockLevelsTop5(): Promise<StockLevelRow[]> {
  const items = await prisma.inventoryItem.findMany({ select: { id: true, sku: true, name: true, unit: true, currentQty: true, reorderThreshold: true } });
  return items
    .map((i) => ({ ...i, low: i.currentQty <= i.reorderThreshold, margin: i.currentQty - i.reorderThreshold }))
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 5)
    .map(({ margin, ...rest }) => rest);
}

export type RecentTransactionRow = {
  id: string;
  date: Date;
  type: "Inquiry" | "Quotation" | "Order" | "Payment";
  reference: string;
  customer: string;
  amount: number | null;
  status: string;
  href: string;
};

/** "Recent Transactions" tabbed table (Image 2) — same merged-row shape as getTodaysActivity, just windowed to the most recent N overall (not "today only") so the dashboard always has rows to show, plus the per-type lists the reference's tabs need. */
export async function getRecentTransactionsTabbed(limit = 8): Promise<{
  all: RecentTransactionRow[];
  inquiries: RecentTransactionRow[];
  quotations: RecentTransactionRow[];
  orders: RecentTransactionRow[];
  payments: RecentTransactionRow[];
}> {
  const [inquiries, quotations, orders, payments] = await Promise.all([
    prisma.inquiry.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { customer: true } }),
    prisma.quotation.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { customer: true } }),
    prisma.order.findMany({ orderBy: { orderDate: "desc" }, take: limit, include: { customer: true } }),
    prisma.payment.findMany({ orderBy: { paymentDate: "desc" }, take: limit, include: { order: { include: { customer: true } } } }),
  ]);

  const inquiryRows: RecentTransactionRow[] = inquiries.map((i) => ({
    id: `inq-${i.id}`, date: i.createdAt, type: "Inquiry", reference: i.desiredProduct, customer: i.customer.name, amount: null, status: i.status, href: `/inquiries/${i.id}`,
  }));
  const quotationRows: RecentTransactionRow[] = quotations.map((q) => ({
    id: `quo-${q.id}`, date: q.createdAt, type: "Quotation", reference: q.quoteNumber, customer: q.customer.name, amount: Number(q.total), status: q.status, href: `/quotations/${q.id}`,
  }));
  const orderRows: RecentTransactionRow[] = orders.map((o) => ({
    id: `ord-${o.id}`, date: o.orderDate, type: "Order", reference: o.orderNumber, customer: o.customer.name, amount: Number(o.totalAmount), status: o.status, href: `/orders/${o.id}`,
  }));
  const paymentRows: RecentTransactionRow[] = payments.map((p) => ({
    id: `pay-${p.id}`, date: p.paymentDate, type: "Payment", reference: p.order.orderNumber, customer: p.order.customer.name, amount: Number(p.amount), status: p.status, href: `/orders/${p.orderId}`,
  }));

  const all = [...inquiryRows, ...quotationRows, ...orderRows, ...paymentRows].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);

  return { all, inquiries: inquiryRows, quotations: quotationRows, orders: orderRows, payments: paymentRows };
}
