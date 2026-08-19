import { prisma } from "@/lib/prisma";

/**
 * The pricing engine (spec Part F/G/H). Deterministic, single-pass order —
 * spec item 25: "the pricing engine must have deterministic rules... never
 * accidentally apply the same discount twice":
 *
 *   Base Price -> Quantity Tier -> Bulk Discount -> Promotion -> Total
 *
 * A quantity tier can EITHER override the per-unit price (the "1-99=₱5,
 * 100-499=₱4.50" style) OR apply a percent discount (the "500+=5% off"
 * style) — never both on the same tier, so a flat-price tier can never
 * also stack a bulk-discount percentage. At most one active Promotion is
 * applied per calculation (the best-matching one, see pickPromotion below).
 *
 * Every branch that can't produce a confident price returns
 * `{ available: false, reason }` rather than inventing a number — spec
 * item 27: "no price should mean staff review", not a guess.
 */

export type PricingBreakdown = {
  available: true;
  method: "PER_PIECE" | "FIXED" | "PER_SET" | "PER_AREA";
  quantity: number;
  unitPrice: number;
  subtotal: number;
  bulkDiscountAmount: number;
  bulkDiscountLabel: string | null;
  promoDiscountAmount: number;
  promoDiscountLabel: string | null;
  totalDiscountAmount: number;
  total: number;
};

export type PricingUnavailable = { available: false; reason: string };

export type PricingResult = PricingBreakdown | PricingUnavailable;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Picks the single Promotion to apply out of every currently-active,
 * date-in-range, qty-in-range match for this service. Priority: a
 * service-specific promotion beats a store-wide one; ties broken by the
 * one that yields the larger discount (most relevant to the customer),
 * then by most-recently-created. This is an explicit, documented priority
 * rule per spec item 25 ("if multiple promotions could apply, establish
 * clear priority rules") — never more than one is ever applied.
 */
function pickPromotion(
  promotions: Array<{
    id: string;
    serviceId: string | null;
    startDate: Date | null;
    endDate: Date | null;
    minQty: number | null;
    maxQty: number | null;
    percentDiscount: unknown;
    fixedDiscount: unknown;
    active: boolean;
    createdAt: Date;
    name: string;
  }>,
  quantity: number,
  amountToDiscount: number
): { name: string; amount: number } | null {
  const now = new Date();
  const eligible = promotions.filter((p) => {
    if (!p.active) return false;
    if (p.startDate && p.startDate > now) return false;
    if (p.endDate && p.endDate < now) return false;
    if (p.minQty != null && quantity < p.minQty) return false;
    if (p.maxQty != null && quantity > p.maxQty) return false;
    return true;
  });
  if (eligible.length === 0) return null;

  const scored = eligible.map((p) => {
    const pct = p.percentDiscount != null ? Number(p.percentDiscount) : null;
    const fixed = p.fixedDiscount != null ? Number(p.fixedDiscount) : null;
    const amount = pct != null ? amountToDiscount * (pct / 100) : fixed ?? 0;
    return { p, amount };
  });

  scored.sort((a, b) => {
    const aServiceSpecific = a.p.serviceId != null ? 1 : 0;
    const bServiceSpecific = b.p.serviceId != null ? 1 : 0;
    if (aServiceSpecific !== bServiceSpecific) return bServiceSpecific - aServiceSpecific;
    if (a.amount !== b.amount) return b.amount - a.amount;
    return b.p.createdAt.getTime() - a.p.createdAt.getTime();
  });

  const best = scored[0];
  return { name: best.p.name, amount: round2(Math.max(0, best.amount)) };
}

export async function calculatePricing(serviceId: string, quantity: number): Promise<PricingResult> {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { available: false, reason: "A valid quantity is required." };
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: {
      pricingTiers: { orderBy: { minQty: "asc" } },
      promotions: true,
    },
  });
  if (!service || !service.active) return { available: false, reason: "Service not found or inactive." };
  if (service.pricingMethod === "NONE") {
    return { available: false, reason: "This service does not have automatic pricing configured." };
  }
  if (service.minQuantity != null && quantity < service.minQuantity) {
    return { available: false, reason: `Instant pricing requires a minimum quantity of ${service.minQuantity}.` };
  }
  if (service.basePrice == null) {
    return { available: false, reason: "This service has no base price configured." };
  }

  const basePrice = Number(service.basePrice);
  const method = service.pricingMethod as "PER_PIECE" | "FIXED" | "PER_SET" | "PER_AREA";

  // FIXED ignores quantity and quantity tiers entirely — it's one flat price.
  if (method === "FIXED") {
    const subtotal = round2(basePrice);
    const promo = pickPromotion(service.promotions, quantity, subtotal);
    const promoAmount = promo ? Math.min(promo.amount, subtotal) : 0;
    return {
      available: true,
      method,
      quantity,
      unitPrice: basePrice,
      subtotal,
      bulkDiscountAmount: 0,
      bulkDiscountLabel: null,
      promoDiscountAmount: promoAmount,
      promoDiscountLabel: promo ? promo.name : null,
      totalDiscountAmount: round2(promoAmount),
      total: round2(Math.max(0, subtotal - promoAmount)),
    };
  }

  // PER_PIECE / PER_SET / PER_AREA all share the same rate x quantity shape
  // — they differ only in what "quantity" semantically represents (pieces,
  // sets, or an area amount the caller supplies). A matching quantity tier
  // can override the per-unit rate directly, OR apply a bulk percent
  // discount off the base-rate subtotal — never both.
  const tier = service.pricingTiers.find((t) => quantity >= t.minQty && (t.maxQty == null || quantity <= t.maxQty));

  let unitPrice = basePrice;
  if (tier?.pricePerUnit != null) unitPrice = Number(tier.pricePerUnit);

  const subtotal = round2(unitPrice * quantity);

  let bulkDiscountAmount = 0;
  let bulkDiscountLabel: string | null = null;
  if (tier?.pricePerUnit == null && tier?.discountPercent != null) {
    const pct = Number(tier.discountPercent);
    bulkDiscountAmount = round2(subtotal * (pct / 100));
    bulkDiscountLabel = `Bulk discount (${tier.minQty}${tier.maxQty ? `-${tier.maxQty}` : "+"}): ${pct}% off`;
  }

  const afterBulk = round2(Math.max(0, subtotal - bulkDiscountAmount));
  const promo = pickPromotion(service.promotions, quantity, afterBulk);
  const promoDiscountAmount = promo ? Math.min(promo.amount, afterBulk) : 0;

  const totalDiscountAmount = round2(bulkDiscountAmount + promoDiscountAmount);
  const total = round2(Math.max(0, subtotal - totalDiscountAmount));

  return {
    available: true,
    method,
    quantity,
    unitPrice,
    subtotal,
    bulkDiscountAmount,
    bulkDiscountLabel,
    promoDiscountAmount,
    promoDiscountLabel: promo ? promo.name : null,
    totalDiscountAmount,
    total,
  };
}
