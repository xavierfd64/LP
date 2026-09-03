-- Pricing correction (Sept 3): tax default 0 + discount type (percentage vs
-- fixed amount) for Quotation and Order. Additive only — no column is
-- dropped or renamed, no row is deleted.

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- AlterTable: Quotation gains the discount's own type + raw entered value,
-- and the tax rate actually applied. Both default to the values that make
-- every existing row's stored discountAmount/taxAmount continue to mean
-- exactly what they already meant.
ALTER TABLE "Quotation"
  ADD COLUMN "discountType"  "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN "discountValue" DECIMAL(12,2)  NOT NULL DEFAULT 0,
  ADD COLUMN "taxPct"        DECIMAL(5,2)   NOT NULL DEFAULT 0;

-- Backfill existing Quotation rows: every discount ever entered through
-- this app before today was a percentage-of-subtotal (there was no other
-- option), so discountType stays PERCENTAGE (already the column default)
-- and discountValue/taxPct are derived from the already-stored amounts —
-- the exact same division editQuotationAction previously did on every edit
-- to recover the rate, now computed once and stored instead of redone
-- from scratch on every future edit.
UPDATE "Quotation"
SET
  "discountValue" = CASE
    WHEN COALESCE("subtotal", "total" + "discountAmount" - "taxAmount") > 0
      THEN ROUND(("discountAmount" / COALESCE("subtotal", "total" + "discountAmount" - "taxAmount")) * 100, 2)
    ELSE 0
  END,
  "taxPct" = CASE
    WHEN (COALESCE("subtotal", "total" + "discountAmount" - "taxAmount") - "discountAmount") > 0
      THEN ROUND(("taxAmount" / (COALESCE("subtotal", "total" + "discountAmount" - "taxAmount") - "discountAmount")) * 100, 2)
    ELSE 0
  END
WHERE "discountAmount" <> 0 OR "taxAmount" <> 0;

-- AlterTable: Order previously stored only the final totalAmount, with the
-- discount/tax breakdown that produced it discarded entirely. All new
-- columns are nullable/defaulted so every existing Order (none of which
-- ever had this breakdown) is unaffected — subtotal stays NULL for them,
-- which document views treat as "no breakdown recorded" and fall back to
-- their prior derivation, exactly as before this migration.
ALTER TABLE "Order"
  ADD COLUMN "subtotal"       DECIMAL(12,2),
  ADD COLUMN "discountType"   "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN "discountValue"  DECIMAL(12,2)  NOT NULL DEFAULT 0,
  ADD COLUMN "discountAmount" DECIMAL(12,2)  NOT NULL DEFAULT 0,
  ADD COLUMN "discountLabel"  TEXT,
  ADD COLUMN "taxPct"         DECIMAL(5,2)   NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount"      DECIMAL(12,2)  NOT NULL DEFAULT 0;
