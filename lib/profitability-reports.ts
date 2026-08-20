import { prisma } from "@/lib/prisma";
import { computeJobOrderCostSummary } from "@/lib/production-cost";
import { computeServiceCostBreakdown } from "@/lib/service-costing";
import type { PeriodRange } from "@/lib/transaction-summary";

/**
 * Management reporting (Aug 20 5th update, Part 5 items 26/27/28) — built
 * entirely from real recorded transactions/consumption, never fabricated.
 * Reuses the exact same "actual-if-resolvable-else-estimate" cost
 * preference as lib/financial-summary.ts, just broken down per Service
 * line rather than per Order.
 */

export type ServiceProfitabilityRow = {
  serviceId: string;
  serviceName: string;
  sales: number;
  cost: number | null;
  profit: number | null;
  marginPct: number | null;
  configuredLines: number;
  totalLines: number;
};

export async function computeServiceProfitability(range: PeriodRange): Promise<ServiceProfitabilityRow[]> {
  const { start, end } = range;
  const contributingOrders = await prisma.order.findMany({
    where: { payments: { some: { status: "CONFIRMED", paymentDate: { gte: start, lt: end } } } },
    include: { quotation: { include: { lineItems: true } }, jobOrders: true },
  });

  type Accum = { serviceName: string; sales: number; cost: number; configuredLines: number; totalLines: number };
  const rows = new Map<string, Accum>();
  const serviceNameCache = new Map<string, string>();

  for (const order of contributingOrders) {
    for (const li of order.quotation?.lineItems ?? []) {
      if (!li.serviceId) continue;
      let serviceName = serviceNameCache.get(li.serviceId);
      if (!serviceName) {
        const service = await prisma.service.findUnique({ where: { id: li.serviceId }, select: { name: true } });
        if (!service) continue;
        serviceName = service.name;
        serviceNameCache.set(li.serviceId, serviceName);
      }

      const entry = rows.get(li.serviceId) ?? { serviceName, sales: 0, cost: 0, configuredLines: 0, totalLines: 0 };
      entry.totalLines += 1;
      entry.sales += Number(li.unitPrice) * li.qty;

      // Prefer the matching Job Order's actual cost; fall back to the BOM/flat estimate at this line's quantity.
      const matchingJO = order.jobOrders.find((jo) => jo.serviceId === li.serviceId);
      let lineCost: number | null = matchingJO ? (await computeJobOrderCostSummary(matchingJO.id)).actualProductionCost : null;
      if (lineCost == null) {
        lineCost = (await computeServiceCostBreakdown(li.serviceId, li.qty)).totalCost;
      }
      if (lineCost != null) {
        entry.cost += lineCost;
        entry.configuredLines += 1;
      }
      rows.set(li.serviceId, entry);
    }
  }

  return [...rows.entries()]
    .map(([serviceId, r]) => {
      const fullyConfigured = r.totalLines > 0 && r.configuredLines === r.totalLines;
      const profit = fullyConfigured ? r.sales - r.cost : null;
      const marginPct = profit != null && r.sales > 0 ? (profit / r.sales) * 100 : null;
      return {
        serviceId,
        serviceName: r.serviceName,
        sales: r.sales,
        cost: fullyConfigured ? r.cost : null,
        profit,
        marginPct,
        configuredLines: r.configuredLines,
        totalLines: r.totalLines,
      };
    })
    .sort((a, b) => b.sales - a.sales);
}

export type MaterialConsumptionRow = {
  inventoryItemId: string;
  materialName: string;
  unit: string;
  totalActualQty: number;
  totalExpectedQty: number | null;
  totalCost: number | null;
  variance: number | null;
  variancePct: number | null;
};

/** Real recorded consumption only (spec items 27/28) — never assumes every variance is waste; that's for the recorded `varianceReason` to explain, not this aggregate. */
export async function computeMaterialConsumptionReport(
  range: PeriodRange,
  filters?: { inventoryItemId?: string; serviceId?: string }
): Promise<MaterialConsumptionRow[]> {
  const { start, end } = range;
  const consumptions = await prisma.jobOrderMaterialConsumption.findMany({
    where: {
      reversedAt: null,
      createdAt: { gte: start, lt: end },
      ...(filters?.inventoryItemId ? { inventoryItemId: filters.inventoryItemId } : {}),
      ...(filters?.serviceId ? { jobOrder: { serviceId: filters.serviceId } } : {}),
    },
    include: { inventoryItem: true },
  });

  type Accum = { materialName: string; unit: string; actualQty: number; expectedQty: number; expectedKnown: boolean; cost: number; costKnown: boolean };
  const rows = new Map<string, Accum>();

  for (const c of consumptions) {
    const entry = rows.get(c.inventoryItemId) ?? {
      materialName: c.inventoryItem.name,
      unit: c.inventoryItem.unit,
      actualQty: 0,
      expectedQty: 0,
      expectedKnown: true,
      cost: 0,
      costKnown: true,
    };
    entry.actualQty += Number(c.actualQty);
    if (c.expectedQty != null) entry.expectedQty += Number(c.expectedQty);
    else entry.expectedKnown = false;
    if (c.totalCostSnapshot != null) entry.cost += Number(c.totalCostSnapshot);
    else entry.costKnown = false;
    rows.set(c.inventoryItemId, entry);
  }

  return [...rows.entries()]
    .map(([inventoryItemId, r]) => {
      const totalExpectedQty = r.expectedKnown ? r.expectedQty : null;
      const variance = totalExpectedQty != null ? r.actualQty - totalExpectedQty : null;
      const variancePct = variance != null && totalExpectedQty ? (variance / totalExpectedQty) * 100 : null;
      return {
        inventoryItemId,
        materialName: r.materialName,
        unit: r.unit,
        totalActualQty: r.actualQty,
        totalExpectedQty,
        totalCost: r.costKnown ? r.cost : null,
        variance,
        variancePct,
      };
    })
    .sort((a, b) => b.totalActualQty - a.totalActualQty);
}
