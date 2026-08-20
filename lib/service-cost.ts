import { prisma } from "@/lib/prisma";

/**
 * The shared estimator behind every "Estimated Production Cost / Gross
 * Profit / Margin" figure in this update (Quotation, Order, Dashboard,
 * P&L) — one calculation, not a parallel one per screen. Deliberately a
 * flat `Service.productionCost x quantity` for now (spec item 15: "a
 * simple base production cost is sufficient" — the full BOM breakdown is
 * an explicitly future update).
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
  const serviceIds = [...new Set(lines.map((l) => l.serviceId).filter((id): id is string => !!id))];
  const services = serviceIds.length
    ? await prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, productionCost: true } })
    : [];
  const costByServiceId = new Map(services.map((s) => [s.id, s.productionCost != null ? Number(s.productionCost) : null]));

  let totalRevenue = 0;
  let totalCost = 0;
  let configuredCount = 0;

  for (const line of lines) {
    totalRevenue += line.sellingAmount;
    const unitCost = line.serviceId ? costByServiceId.get(line.serviceId) : null;
    if (unitCost != null) {
      totalCost += unitCost * line.qty;
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
