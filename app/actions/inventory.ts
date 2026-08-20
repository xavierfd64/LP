"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { requirePermission } from "@/lib/permissions-guard";
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

/**
 * Recording a material purchase IS receiving a supply lot in this
 * system — Part C (Aug 20 3rd update) extends the existing receiving
 * flow with supplier + cost fields rather than building a second,
 * parallel purchase system. `unitCost` is optional (never defaulted to
 * 0) — a purchase can be recorded to correctly increase stock even
 * before its cost is known, and lib/inventory-cost.ts simply excludes an
 * uncosted lot from the average-cost calculation rather than treating it
 * as free (spec items 10/16's "do not invent a value" rule).
 */
const purchaseSchema = z.object({
  itemId: z.string().min(1),
  purchaseDate: z.string().optional(),
  supplierId: z.string().min(1, "Please select a supplier."),
  invoiceNumber: z.string().trim().max(80).optional(),
  quantity: z.coerce.number().int().positive("Enter a valid quantity."),
  unitCost: z.coerce.number().nonnegative().optional(),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "GCASH", "MAYA", "CHEQUE", "VOUCHER", "OTHER"]).optional(),
  referenceNumber: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function recordPurchaseAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("PURCHASE_MANAGE");

  const parsed = purchaseSchema.safeParse({
    itemId: formData.get("itemId"),
    purchaseDate: formData.get("purchaseDate") || undefined,
    supplierId: formData.get("supplierId"),
    invoiceNumber: formData.get("invoiceNumber") || undefined,
    quantity: formData.get("quantity"),
    unitCost: formData.get("unitCost") || undefined,
    paymentMethod: formData.get("paymentMethod") || undefined,
    referenceNumber: formData.get("referenceNumber") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;

  const [item, supplier] = await Promise.all([
    prisma.inventoryItem.findUniqueOrThrow({ where: { id: data.itemId } }),
    prisma.supplier.findUniqueOrThrow({ where: { id: data.supplierId } }),
  ]);
  if (!supplier.active) return "This supplier is inactive. Reactivate it first, or choose another supplier.";

  const lotCode = await nextLotCode(item.sku, item.name);

  const lot = await prisma.$transaction(async (tx) => {
    const created = await tx.supplyLot.create({
      data: {
        inventoryItemId: item.id,
        lotCode,
        receivedDate: data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
        receivedQty: data.quantity,
        remainingQty: data.quantity,
        supplierId: data.supplierId,
        unitCost: data.unitCost ?? null,
        invoiceNumber: data.invoiceNumber || null,
        paymentMethod: data.paymentMethod || null,
        referenceNumber: data.referenceNumber || null,
        notes: data.notes || null,
      },
    });
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { currentQty: { increment: data.quantity } },
    });
    await tx.inventoryMovement.create({
      data: {
        supplyLotId: created.id,
        type: "RECEIVE",
        qty: data.quantity,
        createdById: user.id,
        notes: data.invoiceNumber ? `Purchase — Invoice ${data.invoiceNumber}` : "Purchase",
      },
    });
    return created;
  });

  await logAudit(user.id, "MATERIAL_PURCHASE_CREATED", "SupplyLot", lot.id, {
    lotCode,
    item: item.name,
    supplier: supplier.name,
    qty: data.quantity,
    unitCost: data.unitCost ?? null,
    totalCost: data.unitCost != null ? data.unitCost * data.quantity : null,
  });

  redirect(`/inventory/${item.id}`);
}

/**
 * Only ever allowed while nothing from the lot has been consumed yet
 * (remainingQty === receivedQty) — once material has actually been used
 * in production, the purchase can no longer simply "not have happened."
 * The lot itself is never deleted; it's marked cancelled and excluded
 * from stock/cost going forward while its history stays visible (spec
 * Part C item 24).
 */
export async function cancelPurchaseAction(lotId: string) {
  const user = await requirePermission("PURCHASE_MANAGE");
  const lot = await prisma.supplyLot.findUniqueOrThrow({ where: { id: lotId }, include: { inventoryItem: true } });

  if (lot.cancelledAt) throw new Error("This purchase was already cancelled.");
  if (lot.remainingQty !== lot.receivedQty) {
    throw new Error(
      `Cannot cancel — ${lot.receivedQty - lot.remainingQty} of ${lot.receivedQty} ${lot.inventoryItem.unit} from this purchase has already been used.`
    );
  }

  await prisma.$transaction([
    prisma.supplyLot.update({
      where: { id: lotId },
      data: { remainingQty: 0, cancelledAt: new Date(), cancelledById: user.id },
    }),
    prisma.inventoryItem.update({
      where: { id: lot.inventoryItemId },
      data: { currentQty: { decrement: lot.remainingQty } },
    }),
    prisma.inventoryMovement.create({
      data: {
        supplyLotId: lotId,
        type: "CANCEL",
        qty: -lot.remainingQty,
        createdById: user.id,
        notes: "Purchase cancelled",
      },
    }),
  ]);

  await logAudit(user.id, "MATERIAL_PURCHASE_CANCELLED", "SupplyLot", lotId, {
    lotCode: lot.lotCode,
    item: lot.inventoryItem.name,
    qtyReversed: lot.remainingQty,
  });

  redirect(`/inventory/${lot.inventoryItemId}`);
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
