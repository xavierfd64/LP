/**
 * The single, shared implementation of the manual overall Discount + Tax/VAT
 * math used by both Quotation and Order (Sept 3 pricing correction). Before
 * this existed, the same subtotal -> discount -> tax -> total formula was
 * copy-pasted independently in createQuotationAction, editQuotationAction,
 * and duplicated again client-side in quotation-form.tsx and order-form.tsx
 * — meaning a bug fix (or this one) had to be made four times, and Order's
 * copy was never even sent to the server at all (see app/actions/orders.ts).
 * No "use server" here deliberately — this is plain, side-effect-free
 * arithmetic, safe to import from both server actions and client components
 * for an identical live preview.
 *
 * This is a distinct concept from lib/pricing.ts's calculatePricing(): that
 * one resolves a *per-line* price from a Service's own base-price/quantity-
 * tier/bulk-discount/promotion configuration. This module is the *overall*
 * manual discount/tax a Staff member applies on top of the summed line
 * items — unrelated math, unrelated inputs.
 */

export type DiscountType = "PERCENTAGE" | "FIXED";

export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function nonNegative(n: unknown): number {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
}

export type PricingTotalsInput = {
  subtotal: number;
  discountType: DiscountType | string | null | undefined;
  /** The raw number the user entered — a percent (e.g. 10) or a peso amount (e.g. 250.00), per discountType. */
  discountValue: number | string | null | undefined;
  /** Percent, e.g. 12 for 12%. Defaults to 0 — see the Sept 3 correction: new quotations/orders no longer default to 12%. */
  taxPct: number | string | null | undefined;
};

export type PricingTotals = {
  subtotal: number;
  discountType: DiscountType;
  /** Clamped to a valid range for its type — see computeTotals for exactly how. */
  discountValue: number;
  /** The amount actually subtracted — always <= subtotal, so taxable/grand total can never go negative. */
  discountAmount: number;
  /** Human-readable label for documents/UI — "Discount (10%)" for a percentage, plain "Discount" for a fixed amount (the amount column already shows the peso value, so no unit is needed there). Null when no discount applies. */
  discountLabel: string | null;
  /** Clamped 0-100. */
  taxPct: number;
  taxAmount: number;
  total: number;
};

/**
 * Subtotal -> Discount -> Taxable Amount -> Tax -> Grand Total, preserved
 * exactly as the app already computed it — only the discount's *type* is
 * new. A percentage discount is a % of the subtotal, clamped 0-100 (can't
 * go negative or exceed the full subtotal). A fixed discount is a peso
 * amount, clamped to [0, subtotal] — it can never exceed what's actually
 * being discounted, which is what keeps the taxable amount and grand total
 * from ever going negative (spec requirement).
 */
export function computeTotals(input: PricingTotalsInput): PricingTotals {
  const subtotal = round2(nonNegative(input.subtotal));
  const discountType: DiscountType = input.discountType === "FIXED" ? "FIXED" : "PERCENTAGE";
  let discountValue = nonNegative(input.discountValue);
  let discountAmount: number;

  if (discountType === "PERCENTAGE") {
    discountValue = Math.min(100, discountValue);
    discountAmount = round2((subtotal * discountValue) / 100);
  } else {
    // A fixed discount can never exceed the subtotal it's discounting —
    // the raw entered value is preserved as-is (so e.g. a ₱2,000 discount
    // typed against a ₱1,000 subtotal-in-progress is still there,
    // correctly capped, if more line items later grow the subtotal past
    // ₱2,000), but the *applied* amount is always capped.
    discountAmount = round2(Math.min(discountValue, subtotal));
  }

  const taxable = Math.max(0, round2(subtotal - discountAmount));
  const taxPct = Math.min(100, nonNegative(input.taxPct));
  const taxAmount = round2((taxable * taxPct) / 100);
  const total = round2(taxable + taxAmount);

  const discountLabel =
    discountAmount > 0 ? (discountType === "PERCENTAGE" ? `Discount (${formatPct(discountValue)}%)` : "Discount") : null;

  return { subtotal, discountType, discountValue: round2(discountValue), discountAmount, discountLabel, taxPct: round2(taxPct), taxAmount, total };
}

/** "10" instead of "10.00", but "12.5" stays "12.5" — matches how the existing UI already showed percentages. */
function formatPct(n: number): string {
  return Number(n.toFixed(2)).toString();
}
