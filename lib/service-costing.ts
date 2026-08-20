import { prisma } from "@/lib/prisma";
import { computeItemCostBasis } from "@/lib/inventory-cost";

/**
 * The BOM-aware production-cost engine (Aug 20 4th update, Part D). Always
 * computed at a specific quantity — there is no meaningful "per unit" cost
 * for a FLAT or PER_HOUR component in isolation, so every caller (the
 * Costing page, the Margin Simulator, and lib/service-cost.ts's per-line
 * estimator) asks "what would this cost to produce N units" rather than
 * reading a single stored rate.
 *
 * A Service with no BOM at all (no ServiceBOMMaterial, no
 * ServiceCostComponent rows) falls back to the flat `Service.productionCost`
 * from the 1st update — unchanged behavior for any Service nobody has
 * built a BOM out for yet. The moment a Service has even one BOM row, the
 * BOM supersedes the flat figure entirely (spec Part D's own framing: the
 * flat cost was always meant as a placeholder for "no BOM yet").
 *
 * Material cost is NEVER hard-coded here — it's resolved live from Part
 * C's `computeItemCostBasis` (the purchase-weighted average cost), so a
 * material's cost naturally follows its latest recorded purchases without
 * anyone having to remember to update it on the Service (spec item 7).
 */

export type CostLine = {
  id: string;
  category: "MATERIAL" | "LABOR" | "MACHINE" | "FINISHING" | "OTHER";
  label: string;
  /** null = this line's cost could not be resolved (no inventory cost, or an incomplete PER_HOUR config) — never treated as 0. */
  amount: number | null;
  detail: string | null;
};

export type CostingStatus = "CONFIGURED" | "PARTIAL" | "NOT_CONFIGURED";

export type ServiceCostBreakdown = {
  serviceId: string;
  qty: number;
  mode: "BOM" | "FLAT" | "NONE";
  materialLines: CostLine[];
  componentLines: CostLine[];
  /** The portion of material cost attributable to waste allowances, summed only across fully-configured materials — a display rollup, not a separately stored figure. */
  wasteAmount: number | null;
  totalCost: number | null;
  configuredCount: number;
  totalLineCount: number;
  fullyConfigured: boolean;
  status: CostingStatus;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function computeServiceCostBreakdown(serviceId: string, qty: number): Promise<ServiceCostBreakdown> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: {
      bomMaterials: { include: { inventoryItem: true }, orderBy: { sortOrder: "asc" } },
      costComponents: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!service) {
    return {
      serviceId, qty, mode: "NONE", materialLines: [], componentLines: [], wasteAmount: null,
      totalCost: null, configuredCount: 0, totalLineCount: 0, fullyConfigured: false, status: "NOT_CONFIGURED",
    };
  }

  const hasBOM = service.bomMaterials.length > 0 || service.costComponents.length > 0;

  if (!hasBOM) {
    const flat = service.productionCost != null ? Number(service.productionCost) : null;
    return {
      serviceId, qty, mode: "FLAT", materialLines: [], componentLines: [], wasteAmount: null,
      totalCost: flat != null ? round2(flat * qty) : null,
      configuredCount: flat != null ? 1 : 0,
      totalLineCount: 1,
      fullyConfigured: flat != null,
      status: flat != null ? "CONFIGURED" : "NOT_CONFIGURED",
    };
  }

  const materialLines: CostLine[] = [];
  let wasteAmount = 0;
  let wasteKnown = true;

  for (const m of service.bomMaterials) {
    const basis = await computeItemCostBasis(m.inventoryItemId);
    const baseQty = qty * Number(m.consumptionPerUnit);
    const wasteFraction = m.wastePercent != null ? Number(m.wastePercent) / 100 : 0;
    const actualQty = baseQty * (1 + wasteFraction);

    if (basis.averageUnitCost == null) {
      materialLines.push({
        id: m.id,
        category: "MATERIAL",
        label: m.inventoryItem.name,
        amount: null,
        detail: "Material cost unavailable — no purchase cost recorded for this item.",
      });
      wasteKnown = false;
      continue;
    }

    const totalMaterialCost = actualQty * basis.averageUnitCost;
    const baseCost = baseQty * basis.averageUnitCost;
    wasteAmount += totalMaterialCost - baseCost;

    materialLines.push({
      id: m.id,
      category: "MATERIAL",
      label: m.inventoryItem.name,
      amount: round2(totalMaterialCost),
      detail: `${actualQty.toFixed(2)} ${m.inventoryItem.unit} × ₱${basis.averageUnitCost.toFixed(2)} (avg. cost)${wasteFraction > 0 ? ` incl. ${m.wastePercent}% waste` : ""}`,
    });
  }

  const componentLines: CostLine[] = service.costComponents.map((c) => {
    let amount: number | null = null;
    let detail: string | null = null;
    const rate = Number(c.rate);

    if (c.basis === "PER_UNIT") {
      amount = round2(rate * qty);
      detail = `₱${rate.toFixed(2)} × ${qty}`;
    } else if (c.basis === "FLAT") {
      amount = round2(rate);
      detail = "Flat cost";
    } else if (c.basis === "PER_HOUR") {
      if (c.estimatedHours == null) {
        detail = "Cost calculation incomplete — no estimated hours configured.";
      } else {
        const hours = Number(c.estimatedHours);
        amount = round2(rate * hours * qty);
        detail = `${hours}h × ₱${rate.toFixed(2)}/hr × ${qty}`;
      }
    }

    return { id: c.id, category: c.category, label: c.label, amount, detail };
  });

  const allLines = [...materialLines, ...componentLines];
  const configuredLines = allLines.filter((l) => l.amount != null);
  const totalLineCount = allLines.length;
  const configuredCount = configuredLines.length;
  const fullyConfigured = totalLineCount > 0 && configuredCount === totalLineCount;
  const totalCost = fullyConfigured ? round2(configuredLines.reduce((sum, l) => sum + (l.amount ?? 0), 0)) : null;

  return {
    serviceId,
    qty,
    mode: "BOM",
    materialLines,
    componentLines,
    wasteAmount: wasteKnown ? round2(wasteAmount) : null,
    totalCost,
    configuredCount,
    totalLineCount,
    fullyConfigured,
    status: totalLineCount === 0 ? "NOT_CONFIGURED" : fullyConfigured ? "CONFIGURED" : configuredCount > 0 ? "PARTIAL" : "NOT_CONFIGURED",
  };
}

/**
 * Selling Price -> Gross Profit -> Margin, plus a Recommended Selling
 * Price from an optional target margin (spec item 25):
 * requiredPrice = productionCost / (1 - targetMargin). Never applied
 * automatically to any real price — display only.
 */
export function computeMargin(sellingPrice: number | null, productionCost: number | null) {
  const grossProfit = sellingPrice != null && productionCost != null ? round2(sellingPrice - productionCost) : null;
  const marginPct = grossProfit != null && sellingPrice != null && sellingPrice > 0 ? round2((grossProfit / sellingPrice) * 100) : null;
  return { grossProfit, marginPct };
}

export function computeRecommendedSellingPrice(productionCost: number | null, targetMarginPct: number | null): number | null {
  if (productionCost == null || targetMarginPct == null) return null;
  const fraction = targetMarginPct / 100;
  if (fraction >= 1) return null; // a 100%+ target margin has no finite recommended price
  return round2(productionCost / (1 - fraction));
}

export type ServiceCostingCoverage = {
  configuredCount: number;
  partialCount: number;
  notConfiguredCount: number;
  totalCount: number;
};

/** Catalog-level "how many of our active Services have real costing configured" — a management indicator, not a per-order figure (spec item 31). */
export async function computeServiceCostingCoverage(): Promise<ServiceCostingCoverage> {
  const services = await prisma.service.findMany({ where: { active: true }, select: { id: true } });
  const breakdowns = await Promise.all(services.map((s) => computeServiceCostBreakdown(s.id, 1)));

  let configuredCount = 0;
  let partialCount = 0;
  let notConfiguredCount = 0;
  for (const b of breakdowns) {
    if (b.status === "CONFIGURED") configuredCount++;
    else if (b.status === "PARTIAL") partialCount++;
    else notConfiguredCount++;
  }

  return { configuredCount, partialCount, notConfiguredCount, totalCount: services.length };
}
