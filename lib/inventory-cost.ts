import { prisma } from "@/lib/prisma";

/**
 * Costing method for this foundation (Aug 20 3rd update, spec Part C item
 * 11/12): a simple purchase-weighted MOVING AVERAGE COST, computed across
 * every non-cancelled purchase (SupplyLot) that has a configured unitCost,
 * weighted by the quantity originally received in each purchase — not the
 * remaining quantity, matching the spec's own worked example exactly
 * (10 x P4,000 + 5 x P4,500, weighted by the 10 and the 5). This is
 * explicitly NOT FIFO/LIFO/batch costing (spec item 12) — one blended
 * per-item rate, reused everywhere a unit cost or inventory value is
 * shown. A lot with no unitCost entered is excluded from the average
 * rather than treated as free, and if NO lot for an item has a
 * configured cost, the average comes back null ("Cost not configured"),
 * never a fabricated number.
 */
export type ItemCostBasis = {
  averageUnitCost: number | null;
  configuredLotCount: number;
  totalLotCount: number;
};

export async function computeItemCostBasis(itemId: string): Promise<ItemCostBasis> {
  const lots = await prisma.supplyLot.findMany({
    where: { inventoryItemId: itemId, cancelledAt: null },
    select: { receivedQty: true, unitCost: true },
  });

  const costed = lots.filter((l) => l.unitCost != null);
  const totalQty = costed.reduce((sum, l) => sum + l.receivedQty, 0);
  const totalCost = costed.reduce((sum, l) => sum + Number(l.unitCost) * l.receivedQty, 0);

  return {
    averageUnitCost: costed.length > 0 && totalQty > 0 ? totalCost / totalQty : null,
    configuredLotCount: costed.length,
    totalLotCount: lots.length,
  };
}

export type InventoryValueSummary = {
  totalValue: number;
  itemsWithCost: number;
  itemsWithoutCost: number;
  totalItems: number;
};

/** Inventory Value = current on-hand quantity x that item's average unit cost, summed only across items with a configured cost (spec item 16). */
export async function computeInventoryValueSummary(): Promise<InventoryValueSummary> {
  const items = await prisma.inventoryItem.findMany({
    select: {
      id: true,
      currentQty: true,
      supplyLots: { where: { cancelledAt: null }, select: { receivedQty: true, unitCost: true } },
    },
  });

  let totalValue = 0;
  let itemsWithCost = 0;
  let itemsWithoutCost = 0;

  for (const item of items) {
    const costed = item.supplyLots.filter((l) => l.unitCost != null);
    const totalQty = costed.reduce((sum, l) => sum + l.receivedQty, 0);
    const totalCost = costed.reduce((sum, l) => sum + Number(l.unitCost) * l.receivedQty, 0);
    const avgCost = costed.length > 0 && totalQty > 0 ? totalCost / totalQty : null;

    if (avgCost != null) {
      itemsWithCost += 1;
      totalValue += item.currentQty * avgCost;
    } else {
      itemsWithoutCost += 1;
    }
  }

  return { totalValue, itemsWithCost, itemsWithoutCost, totalItems: items.length };
}

/** Sum of purchase cost recorded within a date range (used for the Inventory dashboard's "Purchases This Month" card) — real recorded costs only, never estimated. */
export async function computePurchasesTotal(start: Date, end: Date): Promise<number> {
  const lots = await prisma.supplyLot.findMany({
    where: { receivedDate: { gte: start, lt: end }, cancelledAt: null, unitCost: { not: null } },
    select: { receivedQty: true, unitCost: true },
  });
  return lots.reduce((sum, l) => sum + Number(l.unitCost) * l.receivedQty, 0);
}
