"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { computeItemCostBasis } from "@/lib/inventory-cost";
import { computeExpectedConsumption } from "@/lib/production-cost";
import { logAudit } from "@/lib/audit";

/**
 * Recording actual material consumption against a Job Order (Aug 20 5th
 * update, Part 5). Never runs at Inquiry/Quotation/Order/JobOrder-creation
 * time (spec item 4) — only when Production/Admin/Staff explicitly
 * records it here. Depletes existing SupplyLots oldest-received-first
 * (so Part C's per-lot `remainingQty` bookkeeping stays honest) while the
 * COST used is the item's average cost basis (Part C), not any one lot's
 * purchase price — consistent with the average-cost model this system
 * has used since Part C/D, not a second (FIFO) costing method.
 */

const consumptionSchema = z.object({
  jobOrderId: z.string().min(1),
  inventoryItemId: z.string().min(1),
  actualQty: z.coerce.number().positive("Enter a valid quantity."),
  allowShortage: z.enum(["true", "false"]).default("false"),
  varianceReason: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function recordConsumptionAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("PRODUCTION_UPDATE_STAGE", ["PRODUCTION"]);

  const parsed = consumptionSchema.safeParse({
    jobOrderId: formData.get("jobOrderId"),
    inventoryItemId: formData.get("inventoryItemId"),
    actualQty: formData.get("actualQty"),
    allowShortage: formData.get("allowShortage") ?? "false",
    varianceReason: formData.get("varianceReason") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;

  const [jobOrder, item] = await Promise.all([
    prisma.jobOrder.findUniqueOrThrow({ where: { id: data.jobOrderId } }),
    prisma.inventoryItem.findUniqueOrThrow({ where: { id: data.inventoryItemId } }),
  ]);

  // Rule #10: never silently go negative. An explicit, reasoned override is
  // the only authorized way past this (spec item 10).
  if (item.currentQty < data.actualQty && data.allowShortage !== "true") {
    return `Insufficient inventory. Available: ${item.currentQty} ${item.unit}, requested: ${data.actualQty} ${item.unit}. Check "record as an approved shortage" to proceed anyway.`;
  }
  if (item.currentQty < data.actualQty && !data.varianceReason) {
    return "An approved shortage requires a reason.";
  }

  const expected = await computeExpectedConsumption(data.jobOrderId);
  const expectedForMaterial = expected.find((e) => e.inventoryItemId === data.inventoryItemId)?.expectedQty ?? null;
  const basis = await computeItemCostBasis(data.inventoryItemId);
  const unitCost = basis.averageUnitCost;
  const totalCost = unitCost != null ? Math.round((unitCost * data.actualQty + Number.EPSILON) * 100) / 100 : null;

  // InventoryMovement always requires a real SupplyLot to attach to, so a
  // material with no purchase history at all has nowhere valid to record
  // consumption against — block with a clear message rather than crash.
  const allLots = await prisma.supplyLot.findMany({ where: { inventoryItemId: data.inventoryItemId }, orderBy: { receivedDate: "asc" } });
  if (allLots.length === 0) {
    return "This material has no purchase records yet. Record a purchase for it before consuming it in production.";
  }
  const depletableLots = allLots.filter((l) => !l.cancelledAt && l.remainingQty > 0);
  const fallbackLot = allLots[allLots.length - 1];

  const record = await prisma.$transaction(async (tx) => {
    const record = await tx.jobOrderMaterialConsumption.create({
      data: {
        jobOrderId: data.jobOrderId,
        inventoryItemId: data.inventoryItemId,
        expectedQty: expectedForMaterial,
        actualQty: data.actualQty,
        unitCostSnapshot: unitCost,
        totalCostSnapshot: totalCost,
        varianceReason: data.varianceReason || null,
        notes: data.notes || null,
        createdById: user.id,
      },
    });

    let remaining = data.actualQty;
    for (const lot of depletableLots) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, lot.remainingQty);
      await tx.supplyLot.update({ where: { id: lot.id }, data: { remainingQty: { decrement: take } } });
      await tx.inventoryMovement.create({
        data: {
          supplyLotId: lot.id,
          jobOrderId: data.jobOrderId,
          type: "CONSUME",
          qty: -take,
          createdById: user.id,
          notes: "Production consumption" + (data.varianceReason ? ` — ${data.varianceReason}` : ""),
          consumptionRecordId: record.id,
        },
      });
      remaining -= take;
    }
    // Any portion beyond what recorded lots could cover (a pre-existing
    // currentQty/lot drift, or an approved shortage past total lot stock)
    // still needs its own ledger entry — the movement/cost record must
    // never disagree with the quantity actually deducted from the item.
    if (remaining > 0) {
      await tx.supplyLot.update({ where: { id: fallbackLot.id }, data: { remainingQty: { decrement: remaining } } });
      await tx.inventoryMovement.create({
        data: {
          supplyLotId: fallbackLot.id,
          jobOrderId: data.jobOrderId,
          type: "CONSUME",
          qty: -remaining,
          createdById: user.id,
          notes: "Production consumption (exceeds recorded lot stock — approved shortage)",
          consumptionRecordId: record.id,
        },
      });
    }

    await tx.inventoryItem.update({ where: { id: data.inventoryItemId }, data: { currentQty: { decrement: data.actualQty } } });

    return record;
  });

  await logAudit(user.id, "MATERIAL_CONSUMPTION_RECORDED", "JobOrder", data.jobOrderId, {
    joNumber: jobOrder.joNumber,
    material: item.name,
    actualQty: data.actualQty,
    expectedQty: expectedForMaterial,
    unitCostSnapshot: unitCost,
    totalCostSnapshot: totalCost,
    consumptionId: record.id,
  });

  redirect(`/job-orders/${data.jobOrderId}`);
}

/**
 * Only ever fully reverses a consumption record — never a partial delta —
 * matching the exact cancel-and-redo idiom already established for
 * purchases in Part C (`cancelPurchaseAction`). Restores the exact
 * quantity to the exact lots it came from, and preserves the original
 * record (flagged reversed, never deleted) as required by spec item 33.
 */
export async function reverseConsumptionAction(consumptionId: string) {
  const user = await requirePermission("PRODUCTION_UPDATE_STAGE", ["PRODUCTION"]);

  const record = await prisma.jobOrderMaterialConsumption.findUniqueOrThrow({
    where: { id: consumptionId },
    include: { movements: true, inventoryItem: true, jobOrder: true },
  });
  if (record.reversedAt) throw new Error("This consumption was already reversed.");

  await prisma.$transaction(async (tx) => {
    for (const movement of record.movements) {
      const restore = Math.abs(movement.qty);
      await tx.supplyLot.update({ where: { id: movement.supplyLotId }, data: { remainingQty: { increment: restore } } });
      await tx.inventoryMovement.create({
        data: {
          supplyLotId: movement.supplyLotId,
          jobOrderId: record.jobOrderId,
          type: "CONSUME_REVERSAL",
          qty: restore,
          createdById: user.id,
          notes: "Reversal of production consumption",
          consumptionRecordId: record.id,
        },
      });
    }
    await tx.inventoryItem.update({ where: { id: record.inventoryItemId }, data: { currentQty: { increment: Number(record.actualQty) } } });
    await tx.jobOrderMaterialConsumption.update({ where: { id: consumptionId }, data: { reversedAt: new Date(), reversedById: user.id } });
  });

  await logAudit(user.id, "MATERIAL_CONSUMPTION_REVERSED", "JobOrder", record.jobOrderId, {
    joNumber: record.jobOrder.joNumber,
    material: record.inventoryItem.name,
    actualQty: Number(record.actualQty),
  });

  redirect(`/job-orders/${record.jobOrderId}`);
}
