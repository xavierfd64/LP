"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { nextLotCode } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";

const itemSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1),
  reorderThreshold: z.coerce.number().int().nonnegative().default(0),
});

export async function createInventoryItemAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["STAFF", "ADMIN"]);

  const parsed = itemSchema.safeParse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    unit: formData.get("unit"),
    reorderThreshold: formData.get("reorderThreshold") || 0,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const existing = await prisma.inventoryItem.findUnique({ where: { sku: parsed.data.sku } });
  if (existing) return "An item with that SKU already exists.";

  const item = await prisma.inventoryItem.create({ data: { ...parsed.data, currentQty: 0 } });
  await logAudit(user.id, "INVENTORY_ITEM_CREATED", "InventoryItem", item.id, parsed.data);

  redirect(`/inventory/${item.id}`);
}

const receiveLotSchema = z.object({
  itemId: z.string().min(1),
  receivedQty: z.coerce.number().int().positive(),
  supplier: z.string().optional(),
});

export async function receiveLotAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["STAFF", "ADMIN"]);

  const parsed = receiveLotSchema.safeParse({
    itemId: formData.get("itemId"),
    receivedQty: formData.get("receivedQty"),
    supplier: formData.get("supplier") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: parsed.data.itemId } });
  const lotCode = await nextLotCode(item.sku, item.name);

  const lot = await prisma.$transaction(async (tx) => {
    const created = await tx.supplyLot.create({
      data: {
        inventoryItemId: item.id,
        lotCode,
        receivedQty: parsed.data.receivedQty,
        remainingQty: parsed.data.receivedQty,
        supplier: parsed.data.supplier,
      },
    });
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { currentQty: { increment: parsed.data.receivedQty } },
    });
    await tx.inventoryMovement.create({
      data: {
        supplyLotId: created.id,
        type: "RECEIVE",
        qty: parsed.data.receivedQty,
        createdById: user.id,
      },
    });
    return created;
  });

  await logAudit(user.id, "INVENTORY_LOT_RECEIVED", "SupplyLot", lot.id, { lotCode, qty: parsed.data.receivedQty });

  redirect(`/inventory/${item.id}`);
}

const movementSchema = z.object({
  lotId: z.string().min(1),
  type: z.enum(["ALLOCATE", "CONSUME", "REJECT", "WASTE", "ADJUST"]),
  qty: z.coerce.number().int(),
  jobOrderId: z.string().optional(),
  notes: z.string().optional(),
});

export async function recordMovementAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["STAFF", "ADMIN", "PRODUCTION"]);

  const parsed = movementSchema.safeParse({
    lotId: formData.get("lotId"),
    type: formData.get("type"),
    qty: formData.get("qty"),
    jobOrderId: formData.get("jobOrderId") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const { lotId, type, jobOrderId, notes, qty } = parsed.data;

  if (type !== "ADJUST" && qty <= 0) return "Enter a positive quantity.";

  const lot = await prisma.supplyLot.findUniqueOrThrow({ where: { id: lotId } });

  // Rule #5: SupplyLot.remainingQty must never go negative.
  const delta = type === "ADJUST" ? qty : -Math.abs(qty);
  const newRemaining = lot.remainingQty + delta;
  if (newRemaining < 0) {
    return `Cannot consume more than the remaining quantity in this lot (${lot.remainingQty} ${type === "ADJUST" ? "" : "available"}).`;
  }

  await prisma.$transaction([
    prisma.supplyLot.update({ where: { id: lotId }, data: { remainingQty: newRemaining } }),
    prisma.inventoryItem.update({ where: { id: lot.inventoryItemId }, data: { currentQty: { increment: delta } } }),
    prisma.inventoryMovement.create({
      data: {
        supplyLotId: lotId,
        jobOrderId: jobOrderId || undefined,
        type,
        qty: delta,
        createdById: user.id,
        notes,
      },
    }),
  ]);

  await logAudit(user.id, "INVENTORY_MOVEMENT_RECORDED", "SupplyLot", lotId, { type, qty: delta, jobOrderId });

  redirect(`/inventory/${lot.inventoryItemId}`);
}
