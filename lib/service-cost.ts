import { prisma } from "@/lib/prisma";
import { computeServiceCostBreakdown } from "@/lib/service-costing";

/**
 * The shared estimator behind every "Estimated Production Cost / Gross
 * Profit / Margin" figure across this system (Quotation, Order, Dashboard,
 * P&L) — one calculation, not a parallel one per screen. As of the Aug 20
 * 4th update (Part D), each line's cost is resolved via
 * `computeServiceCostBreakdown()` — the BOM-aware engine that falls back to
 * the flat `Service.productionCost` for any Service without a BOM built
 * out, so nothing from the 1st update's simple-cost Services changes.
 *
 * The one rule every caller must respect (spec items 8/17): a line whose
 * Service has no configured cost is NOT treated as ₱0. It's excluded from
 * `totalCost` and counted in `unconfiguredCount` instead, and the
 * aggregate only exposes `grossProfit`/`margin` when `fullyConfigured` is
 * true — never a number that looks more precise than the underlying data
 * actually is.
 */

export type CostableLine = {
  serviceId: string | null;
  qty: number;
  /** The line's actual selling amount (unit price x qty, or however the caller already computed it) — never re-derived here. */
  sellingAmount: number;
};

export type AggregateCostEstimate = {
  totalCount: number;
  configuredCount: number;
  unconfiguredCount: number;
  fullyConfigured: boolean;
  totalRevenue: number;
  /** Sum of cost across only the lines with a configured Service.productionCost. */
  totalCost: number;
  /** Only set when every contributing line has a configured cost. */
  grossProfit: number | null;
  /** Only set alongside grossProfit. */
  margin: number | null;
};

export async function estimateCostForLines(lines: CostableLine[]): Promise<AggregateCostEstimate> {
  // Resolve every distinct (serviceId, qty) pair's breakdown concurrently —
  // several lines commonly share the same service+quantity, and there's no
  // reason to recompute (or re-hit the DB for) the same breakdown twice, or
  // to resolve unrelated services' breakdowns one at a time (spec item 39).
  const uniqueKeys = new Map<string, { serviceId: string; qty: number }>();
  for (const line of lines) {
    if (!line.serviceId) continue;
    uniqueKeys.set(`${line.serviceId}:${line.qty}`, { serviceId: line.serviceId, qty: line.qty });
  }
  const breakdownEntries = await Promise.all(
    [...uniqueKeys.entries()].map(async ([key, { serviceId, qty }]) => [key, await computeServiceCostBreakdown(serviceId, qty)] as const)
  );
  const breakdownByKey = new Map(breakdownEntries);

  let totalRevenue = 0;
  let totalCost = 0;
  let configuredCount = 0;

  for (const line of lines) {
    totalRevenue += line.sellingAmount;
    if (!line.serviceId) continue;
    const breakdown = breakdownByKey.get(`${line.serviceId}:${line.qty}`);
    if (breakdown?.totalCost != null) {
      totalCost += breakdown.totalCost;
      configuredCount += 1;
    }
  }

  const totalCount = lines.length;
  const fullyConfigured = totalCount > 0 && configuredCount === totalCount;
  const grossProfit = fullyConfigured ? totalRevenue - totalCost : null;
  const margin = fullyConfigured && totalRevenue > 0 ? (grossProfit! / totalRevenue) * 100 : null;

  return {
    totalCount,
    configuredCount,
    unconfiguredCount: totalCount - configuredCount,
    fullyConfigured,
    totalRevenue,
    totalCost,
    grossProfit,
    margin,
  };
}
