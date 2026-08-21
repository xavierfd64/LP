import { prisma } from "@/lib/prisma";
import { estimateCostForLines } from "@/lib/service-cost";
import { computeJobOrderCostSummary } from "@/lib/production-cost";
import type { PeriodRange } from "@/lib/transaction-summary";

/**
 * The Sales -> Production Cost -> Gross Profit -> Operating Expenses ->
 * Net Profit foundation (Aug 20 1st update). Revenue reuses the exact
 * same definition already established across this app (confirmed Payment
 * amounts within the range — see lib/transaction-summary.ts's
 * `salesRevenue` and the Admin dashboard's "Today's Sales"), so this
 * isn't a second, competing notion of "sales."
 *
 * Production Cost is estimated from the *full* Quotation line items of
 * every Order that received a confirmed payment in this range — not
 * prorated to the payment amount itself. For an order paid across
 * multiple periods this can put a little more cost in one period's
 * figure than a strict cash-matched accrual would, which is a known,
 * disclosed simplification appropriate to a foundation (spec item 14:
 * "do not build the entire advanced costing system yet"), not silently
 * hidden — the P&L page states this explicitly.
 *
 * Whether the resulting Gross/Net Profit can be shown at all follows
 * spec item 17's accuracy rule: if any contributing Order has no linked
 * Quotation, or any line's Service has no configured production cost,
 * `grossProfit`/`netProfit` come back null rather than a number that
 * looks more precise than the underlying data actually is.
 */

export type ExpenseCategoryBreakdown = {
  categoryId: string;
  categoryName: string;
  total: number;
};

/**
 * Operating Expenses grouped by category for a date range (Aug 20 2nd
 * update, Part B item 10) — real recorded expenses only, sorted highest
 * first, with the grand total reconciling exactly to
 * computeFinancialFoundation's own `operatingExpenses` figure since both
 * read from the same OperatingExpense rows for the same range.
 */
export async function getOperatingExpensesByCategory(range: PeriodRange): Promise<ExpenseCategoryBreakdown[]> {
  const { start, end } = range;
  const grouped = await prisma.operatingExpense.groupBy({
    by: ["categoryId"],
    where: { expenseDate: { gte: start, lt: end }, voidedAt: null },
    _sum: { amount: true },
  });
  if (grouped.length === 0) return [];

  const categories = await prisma.expenseCategory.findMany({
    where: { id: { in: grouped.map((g) => g.categoryId) } },
  });
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  return grouped
    .map((g) => ({
      categoryId: g.categoryId,
      categoryName: nameById.get(g.categoryId) ?? "Unknown",
      total: Number(g._sum.amount ?? 0),
    }))
    .sort((a, b) => b.total - a.total);
}

export type FinancialFoundationSummary = {
  revenue: number;
  cogs: number;
  cogsFullyConfigured: boolean;
  cogsConfiguredCount: number;
  cogsTotalCount: number;
  grossProfit: number | null;
  grossMargin: number | null;
  operatingExpenses: number;
  netProfit: number | null;
  netMargin: number | null;
  // Aug 20 5th update, Part 5 — how much of `cogs` is real production data
  // versus the Part D BOM/flat estimate, per spec items 23/24/25's
  // "Costing Coverage" — never presented as if every order were actually
  // costed when some are still estimates.
  actualCogsOrderCount: number;
  estimatedCogsOrderCount: number;
  costingCoveragePct: number | null;
};

export async function computeFinancialFoundation(range: PeriodRange): Promise<FinancialFoundationSummary> {
  const { start, end } = range;

  const [contributingOrders, expenseAgg] = await Promise.all([
    prisma.order.findMany({
      where: { payments: { some: { status: "CONFIRMED", paymentDate: { gte: start, lt: end } } } },
      include: {
        payments: { where: { status: "CONFIRMED", paymentDate: { gte: start, lt: end } } },
        quotation: { include: { lineItems: true } },
        jobOrders: { select: { id: true } },
      },
    }),
    prisma.operatingExpense.aggregate({
      where: { expenseDate: { gte: start, lt: end }, voidedAt: null },
      _sum: { amount: true },
    }),
  ]);

  const revenue = contributingOrders.reduce((sum, o) => sum + o.payments.reduce((s, p) => s + Number(p.amount), 0), 0);

  // Per contributing Order: prefer ACTUAL production cost (summed across
  // its Job Orders' actual material consumption + estimated non-material
  // components) when every one of its Job Orders is fully costed; only
  // when that's not available does the order fall back to the Part
  // D/1st-update estimate (BOM/flat cost x the Quotation's line
  // quantities) — the exact calculation this function always used before
  // Part 5. Never a partial mix of actual+estimated within one order,
  // which would risk double-counting or under-counting a single Job
  // Order's material cost.
  let totalCost = 0;
  let configuredCount = 0;
  let actualCogsOrderCount = 0;
  let estimatedCogsOrderCount = 0;

  for (const order of contributingOrders) {
    let orderCost: number | null = null;

    if (order.jobOrders.length > 0) {
      const summaries = await Promise.all(order.jobOrders.map((jo) => computeJobOrderCostSummary(jo.id)));
      if (summaries.every((s) => s.actualProductionCost != null)) {
        orderCost = summaries.reduce((sum, s) => sum + (s.actualProductionCost ?? 0), 0);
        totalCost += orderCost;
        configuredCount += 1;
        actualCogsOrderCount += 1;
        continue;
      }
    }

    const lines = order.quotation && order.quotation.lineItems.length > 0
      ? order.quotation.lineItems.map((li) => ({ serviceId: li.serviceId, qty: li.qty, sellingAmount: Number(li.unitPrice) * li.qty }))
      : [{ serviceId: null, qty: 1, sellingAmount: Number(order.totalAmount) }];
    const estimate = await estimateCostForLines(lines);
    if (estimate.fullyConfigured) {
      totalCost += estimate.totalCost;
      configuredCount += 1;
      estimatedCogsOrderCount += 1;
    }
  }

  const operatingExpenses = Number(expenseAgg._sum.amount ?? 0);
  const totalCount = contributingOrders.length;
  const cogsFullyConfigured = totalCount > 0 && configuredCount === totalCount;

  const grossProfit = cogsFullyConfigured ? revenue - totalCost : null;
  const grossMargin = grossProfit != null && revenue > 0 ? (grossProfit / revenue) * 100 : null;
  const netProfit = grossProfit != null ? grossProfit - operatingExpenses : null;
  const netMargin = netProfit != null && revenue > 0 ? (netProfit / revenue) * 100 : null;
  const costedOrderCount = actualCogsOrderCount + estimatedCogsOrderCount;

  return {
    revenue,
    cogs: totalCost,
    cogsFullyConfigured,
    cogsConfiguredCount: configuredCount,
    cogsTotalCount: totalCount,
    grossProfit,
    grossMargin,
    operatingExpenses,
    netProfit,
    netMargin,
    actualCogsOrderCount,
    estimatedCogsOrderCount,
    costingCoveragePct: costedOrderCount > 0 ? Math.round((actualCogsOrderCount / costedOrderCount) * 100) : null,
  };
}
