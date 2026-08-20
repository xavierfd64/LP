import { prisma } from "@/lib/prisma";
import { computeServiceCostBreakdown } from "@/lib/service-costing";

/**
 * Actual production costing (Aug 20 5th update, Part 5) — connects Part
 * D's BOM/estimate engine to what a Job Order actually consumed. Material
 * cost here is ACTUAL (from JobOrderMaterialConsumption's cost snapshots);
 * Labor/Machine/Finishing/Other remain ESTIMATED (this update doesn't add
 * actual time-tracking or metering — spec item 14 is explicit that these
 * stay configured-rate estimates). The combined figure is therefore
 * labeled "Actual/Calculated Production Cost", never bare "Actual",
 * whenever any component is still an estimate.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type ExpectedMaterialLine = {
  inventoryItemId: string;
  name: string;
  unit: string;
  expectedQty: number;
  consumedQty: number;
  availableQty: number;
  wastePercent: number | null;
};

/** BOM-derived expected consumption for this Job Order's quantity, alongside what's already been recorded and what's on hand — the data behind the Materials panel (spec item 5). */
export async function computeExpectedConsumption(jobOrderId: string): Promise<ExpectedMaterialLine[]> {
  const jo = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    include: {
      service: { include: { bomMaterials: { include: { inventoryItem: true }, orderBy: { sortOrder: "asc" } } } },
      materialConsumptions: { where: { reversedAt: null } },
    },
  });
  if (!jo || !jo.service) return [];

  return jo.service.bomMaterials.map((m) => {
    const wasteFraction = m.wastePercent != null ? Number(m.wastePercent) / 100 : 0;
    const expectedQty = jo.quantity * Number(m.consumptionPerUnit) * (1 + wasteFraction);
    const consumedQty = jo.materialConsumptions
      .filter((c) => c.inventoryItemId === m.inventoryItemId)
      .reduce((sum, c) => sum + Number(c.actualQty), 0);
    return {
      inventoryItemId: m.inventoryItemId,
      name: m.inventoryItem.name,
      unit: m.inventoryItem.unit,
      expectedQty: round2(expectedQty),
      consumedQty: round2(consumedQty),
      availableQty: m.inventoryItem.currentQty,
      wastePercent: m.wastePercent != null ? Number(m.wastePercent) : null,
    };
  });
}

export type JobOrderCostingStatus = "NOT_COSTED" | "PARTIALLY_COSTED" | "FULLY_COSTED";

export type VarianceLine = { category: string; expected: number | null; actual: number | null; variance: number | null };

export type JobOrderCostSummary = {
  costingStatus: JobOrderCostingStatus;
  actualMaterialCost: number | null;
  estimatedNonMaterialCost: number | null;
  actualProductionCost: number | null;
  estimatedProductionCost: number | null;
  costVariance: number | null;
  costVariancePct: number | null;
  varianceBreakdown: VarianceLine[];
  sellingPrice: number | null;
  estimatedGrossProfit: number | null;
  actualGrossProfit: number | null;
  actualGrossMarginPct: number | null;
};

/**
 * The Job Order's full "Production Cost Summary" (spec item 20) — one
 * function, reused by the Job Order page and the Service Profitability /
 * Material reports so there's a single definition of "actual" everywhere.
 */
export async function computeJobOrderCostSummary(jobOrderId: string): Promise<JobOrderCostSummary> {
  const jo = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    include: {
      service: { include: { bomMaterials: true } },
      materialConsumptions: { where: { reversedAt: null } },
      order: { include: { quotation: { include: { lineItems: true } } } },
    },
  });
  if (!jo) {
    return {
      costingStatus: "NOT_COSTED", actualMaterialCost: null, estimatedNonMaterialCost: null, actualProductionCost: null,
      estimatedProductionCost: null, costVariance: null, costVariancePct: null, varianceBreakdown: [],
      sellingPrice: null, estimatedGrossProfit: null, actualGrossProfit: null, actualGrossMarginPct: null,
    };
  }

  const expectedMaterialIds = new Set(jo.service?.bomMaterials.map((m) => m.inventoryItemId) ?? []);
  const consumedMaterialIds = new Set(jo.materialConsumptions.map((c) => c.inventoryItemId));

  let costingStatus: JobOrderCostingStatus;
  if (consumedMaterialIds.size === 0) {
    costingStatus = "NOT_COSTED";
  } else {
    const allExpectedConsumed = [...expectedMaterialIds].every((id) => consumedMaterialIds.has(id));
    const allCosted = jo.materialConsumptions.every((c) => c.totalCostSnapshot != null);
    costingStatus = allExpectedConsumed && allCosted ? "FULLY_COSTED" : "PARTIALLY_COSTED";
  }

  const hasConsumptions = jo.materialConsumptions.length > 0;
  const allConsumptionsCosted = hasConsumptions && jo.materialConsumptions.every((c) => c.totalCostSnapshot != null);
  const actualMaterialCost = allConsumptionsCosted
    ? round2(jo.materialConsumptions.reduce((sum, c) => sum + Number(c.totalCostSnapshot), 0))
    : null;

  const estimatedBreakdown = jo.serviceId ? await computeServiceCostBreakdown(jo.serviceId, jo.quantity) : null;
  const nonMaterialConfigured = estimatedBreakdown ? estimatedBreakdown.componentLines.every((l) => l.amount != null) : true;
  const estimatedNonMaterialCost = estimatedBreakdown && nonMaterialConfigured
    ? round2(estimatedBreakdown.componentLines.reduce((sum, l) => sum + (l.amount ?? 0), 0))
    : null;

  const actualProductionCost = actualMaterialCost != null && estimatedNonMaterialCost != null ? round2(actualMaterialCost + estimatedNonMaterialCost) : null;
  const estimatedProductionCost = estimatedBreakdown?.totalCost ?? null;

  const costVariance = actualProductionCost != null && estimatedProductionCost != null ? round2(actualProductionCost - estimatedProductionCost) : null;
  const costVariancePct = costVariance != null && estimatedProductionCost ? round2((costVariance / estimatedProductionCost) * 100) : null;

  const estimatedMaterialCost = estimatedBreakdown && estimatedBreakdown.materialLines.every((l) => l.amount != null)
    ? round2(estimatedBreakdown.materialLines.reduce((sum, l) => sum + (l.amount ?? 0), 0))
    : null;
  const varianceBreakdown: VarianceLine[] = [
    {
      category: "Material",
      expected: estimatedMaterialCost,
      actual: actualMaterialCost,
      variance: estimatedMaterialCost != null && actualMaterialCost != null ? round2(actualMaterialCost - estimatedMaterialCost) : null,
    },
    ...(estimatedBreakdown
      ? Object.entries(
          estimatedBreakdown.componentLines.reduce<Record<string, number | null>>((acc, l) => {
            acc[l.category] = acc[l.category] === null || l.amount == null ? null : (acc[l.category] ?? 0) + l.amount;
            return acc;
          }, {})
        ).map(([category, amount]) => ({
          category: category.charAt(0) + category.slice(1).toLowerCase(),
          expected: amount,
          actual: amount, // no separate "actual" tracking for non-material components yet (spec item 14) — same estimate on both sides, so variance is honestly 0, not fabricated
          variance: amount != null ? 0 : null,
        }))
      : []),
  ];

  let sellingPrice: number | null = null;
  if (jo.order.quotation) {
    const li = jo.order.quotation.lineItems.find((l) => l.serviceId === jo.serviceId);
    if (li) sellingPrice = Number(li.unitPrice) * jo.quantity;
  }

  const estimatedGrossProfit = sellingPrice != null && estimatedProductionCost != null ? round2(sellingPrice - estimatedProductionCost) : null;
  const actualGrossProfit = sellingPrice != null && actualProductionCost != null ? round2(sellingPrice - actualProductionCost) : null;
  const actualGrossMarginPct = actualGrossProfit != null && sellingPrice && sellingPrice > 0 ? round2((actualGrossProfit / sellingPrice) * 100) : null;

  return {
    costingStatus,
    actualMaterialCost,
    estimatedNonMaterialCost,
    actualProductionCost,
    estimatedProductionCost,
    costVariance,
    costVariancePct,
    varianceBreakdown,
    sellingPrice,
    estimatedGrossProfit,
    actualGrossProfit,
    actualGrossMarginPct,
  };
}
