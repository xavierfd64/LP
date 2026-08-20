import { prisma } from "@/lib/prisma";
import { estimateCostForLines } from "@/lib/service-cost";
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
};

export async function computeFinancialFoundation(range: PeriodRange): Promise<FinancialFoundationSummary> {
  const { start, end } = range;

  const [contributingOrders, expenseAgg] = await Promise.all([
    prisma.order.findMany({
      where: { payments: { some: { status: "CONFIRMED", paymentDate: { gte: start, lt: end } } } },
      include: {
        payments: { where: { status: "CONFIRMED", paymentDate: { gte: start, lt: end } } },
        quotation: { include: { lineItems: true } },
      },
    }),
    prisma.operatingExpense.aggregate({
      where: { expenseDate: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
  ]);

  const revenue = contributingOrders.reduce((sum, o) => sum + o.payments.reduce((s, p) => s + Number(p.amount), 0), 0);

  // Each contributing Order becomes one or more "costable lines." An Order
  // with a linked Quotation contributes its real line items (serviceId +
  // qty, so cost can resolve per-Service); an Order with no Quotation link
  // contributes a single synthetic line with no Service, which
  // estimateCostForLines will correctly treat as "cost unconfigured" —
  // never inventing a cost for it.
  const lines = contributingOrders.flatMap((o) => {
    if (o.quotation && o.quotation.lineItems.length > 0) {
      return o.quotation.lineItems.map((li) => ({ serviceId: li.serviceId, qty: li.qty, sellingAmount: Number(li.unitPrice) * li.qty }));
    }
    return [{ serviceId: null, qty: 1, sellingAmount: Number(o.totalAmount) }];
  });

  const cost = await estimateCostForLines(lines);
  const operatingExpenses = Number(expenseAgg._sum.amount ?? 0);

  const grossProfit = cost.fullyConfigured ? revenue - cost.totalCost : null;
  const grossMargin = grossProfit != null && revenue > 0 ? (grossProfit / revenue) * 100 : null;
  const netProfit = grossProfit != null ? grossProfit - operatingExpenses : null;
  const netMargin = netProfit != null && revenue > 0 ? (netProfit / revenue) * 100 : null;

  return {
    revenue,
    cogs: cost.totalCost,
    cogsFullyConfigured: cost.fullyConfigured,
    cogsConfiguredCount: cost.configuredCount,
    cogsTotalCount: cost.totalCount,
    grossProfit,
    grossMargin,
    operatingExpenses,
    netProfit,
    netMargin,
  };
}
