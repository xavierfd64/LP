-- Historical Transaction Encoding (Sept 3): lets Admin/Staff encode orders
-- and payments that actually happened in the past but were never entered
-- into the system, while keeping the real system-encoding timestamp intact.
-- Additive only — no column dropped or renamed, no row deleted.

-- CreateEnum
CREATE TYPE "HistoricalOrderType" AS ENUM ('PENDING_PRODUCTION', 'ALREADY_RELEASED');

-- AlterEnum: two new permissions gating the historical-encoding actions.
ALTER TYPE "Permission" ADD VALUE 'ORDER_BACKDATE';
ALTER TYPE "Permission" ADD VALUE 'PAYMENT_BACKDATE';

-- AlterTable: Order gains a real business date (orderDate) separate from
-- createdAt, plus the structured historical flags. orderDate is added with
-- a DEFAULT of now() so it's never null for a brand new row, but that
-- default only applies going forward — see the backfill immediately below,
-- which sets every EXISTING order's orderDate to its own original
-- createdAt (not to "now", which is what a bare column default would give
-- every pre-existing row otherwise).
ALTER TABLE "Order"
  ADD COLUMN "isHistorical"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "historicalOrderType" "HistoricalOrderType",
  ADD COLUMN "historicalNotes"     TEXT,
  ADD COLUMN "orderDate"           TIMESTAMP(3) NOT NULL DEFAULT now();

UPDATE "Order" SET "orderDate" = "createdAt";

-- AlterTable: Payment gains the same historical flag, purely for audit-trail
-- and payment-history clarity — paymentDate already independently carries
-- the real business date (pre-existing, unaffected by this migration).
ALTER TABLE "Payment"
  ADD COLUMN "isHistorical" BOOLEAN NOT NULL DEFAULT false;
