"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";

const tierSchema = z.object({
  minQty: z.coerce.number().int().positive(),
  maxQty: z.coerce.number().int().positive().optional(),
  pricePerUnit: z.coerce.number().nonnegative().optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
});

function parseTiers(formData: FormData) {
  const minQtys = formData.getAll("tierMinQty") as string[];
  const maxQtys = formData.getAll("tierMaxQty") as string[];
  const modes = formData.getAll("tierMode") as string[];
  const values = formData.getAll("tierValue") as string[];

  return minQtys.map((_, i) => ({
    minQty: minQtys[i],
    maxQty: maxQtys[i] || undefined,
    pricePerUnit: modes[i] === "price" ? values[i] : undefined,
    discountPercent: modes[i] === "discount" ? values[i] : undefined,
  }));
}

const pricingSchema = z.object({
  pricingMethod: z.enum(["NONE", "PER_PIECE", "FIXED", "PER_SET", "PER_AREA"]),
  basePrice: z.coerce.number().nonnegative().optional(),
  minQuantity: z.coerce.number().int().positive().optional(),
  instantQuoteEnabled: z.boolean(),
});

/**
 * Single save action for a Service's pricing configuration (spec Part F/G
 * item 19/21) — method, base price, minimum instant-quote quantity, and
 * the full set of bulk-pricing tiers, all in one form submit. Tiers use
 * replace-all-on-save (delete + recreate), the same pattern already used
 * for WorkflowTemplate stages in app/actions/workflow-templates.ts.
 */
export async function updateServicePricingAction(serviceId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SERVICE_MANAGE");

  const parsed = pricingSchema.safeParse({
    pricingMethod: formData.get("pricingMethod"),
    basePrice: formData.get("basePrice") || undefined,
    minQuantity: formData.get("minQuantity") || undefined,
    instantQuoteEnabled: formData.get("instantQuoteEnabled") === "on",
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;

  if (data.instantQuoteEnabled) {
    if (data.pricingMethod === "NONE") return "Choose a pricing method before enabling instant quotation.";
    if (data.basePrice == null) return "Set a base price before enabling instant quotation.";
  }

  const rawTiers = parseTiers(formData).filter((t) => t.minQty);
  const tiersParsed = z.array(tierSchema).safeParse(rawTiers);
  if (!tiersParsed.success) return tiersParsed.error.issues[0]?.message ?? "Invalid pricing tier.";
  for (const t of tiersParsed.data) {
    if (t.pricePerUnit == null && t.discountPercent == null) {
      return "Each pricing tier needs either a flat unit price or a discount percentage.";
    }
    if (t.maxQty != null && t.maxQty < t.minQty) {
      return "A tier's maximum quantity can't be less than its minimum quantity.";
    }
  }

  await prisma.$transaction([
    prisma.pricelist.deleteMany({ where: { serviceId } }),
    prisma.service.update({
      where: { id: serviceId },
      data: {
        pricingMethod: data.pricingMethod,
        basePrice: data.pricingMethod === "NONE" ? null : data.basePrice,
        minQuantity: data.minQuantity,
        instantQuoteEnabled: data.instantQuoteEnabled,
        pricingTiers: { create: tiersParsed.data },
      },
    }),
  ]);

  await logAudit(user.id, "SERVICE_PRICING_UPDATED", "Service", serviceId, {
    pricingMethod: data.pricingMethod,
    instantQuoteEnabled: data.instantQuoteEnabled,
    tierCount: tiersParsed.data.length,
  });

  redirect(`/admin/services/${serviceId}`);
}

const promotionSchema = z.object({
  name: z.string().min(2, "Promotion name is required."),
  serviceId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  minQty: z.coerce.number().int().positive().optional(),
  maxQty: z.coerce.number().int().positive().optional(),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.coerce.number().positive(),
});

function parsePromotion(formData: FormData) {
  return promotionSchema.safeParse({
    name: formData.get("name"),
    serviceId: formData.get("serviceId") || undefined,
    startDate: formData.get("startDate") || undefined,
    endDate: formData.get("endDate") || undefined,
    minQty: formData.get("minQty") || undefined,
    maxQty: formData.get("maxQty") || undefined,
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
  });
}

export async function createPromotionAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SERVICE_MANAGE");
  const parsed = parsePromotion(formData);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const d = parsed.data;
  if (d.startDate && d.endDate && new Date(d.startDate) > new Date(d.endDate)) {
    return "The start date must be before the end date.";
  }

  const promotion = await prisma.promotion.create({
    data: {
      name: d.name,
      serviceId: d.serviceId || null,
      startDate: d.startDate ? new Date(d.startDate) : null,
      endDate: d.endDate ? new Date(d.endDate) : null,
      minQty: d.minQty,
      maxQty: d.maxQty,
      percentDiscount: d.discountType === "percent" ? d.discountValue : null,
      fixedDiscount: d.discountType === "fixed" ? d.discountValue : null,
    },
  });

  await logAudit(user.id, "PROMOTION_CREATED", "Promotion", promotion.id, { name: d.name });
  redirect("/admin/promotions");
}

export async function togglePromotionActiveAction(promotionId: string) {
  const user = await requirePermission("SERVICE_MANAGE");
  const promo = await prisma.promotion.findUniqueOrThrow({ where: { id: promotionId } });
  await prisma.promotion.update({ where: { id: promotionId }, data: { active: !promo.active } });
  await logAudit(user.id, "PROMOTION_TOGGLED", "Promotion", promotionId, { active: !promo.active });
  redirect("/admin/promotions");
}
