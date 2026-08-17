-- CreateEnum
CREATE TYPE "DocumentAccessLevel" AS ENUM ('VIEW_ONLY', 'VIEW_DOWNLOAD');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'DOCUMENT_VIEW';
ALTER TYPE "Permission" ADD VALUE 'DOCUMENT_SHARE';
ALTER TYPE "Permission" ADD VALUE 'DOCUMENT_DOWNLOAD';
ALTER TYPE "Permission" ADD VALUE 'DOCUMENT_REVOKE';
ALTER TYPE "Permission" ADD VALUE 'ORDER_TRACKING_MANAGE';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactNumber" TEXT,
ADD COLUMN     "displayId" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "facebookUrl" TEXT;

-- Backfill: give every pre-existing Customer row a sequential display ID
-- (CUST-000001, CUST-000002, ...) ordered by createdAt, before the column
-- is locked to NOT NULL + UNIQUE below. New rows generate their own via
-- lib/numbering.ts's nextCustomerDisplayId(), following the same
-- ORD-/QUO-/JO- sequential-numbering convention already used elsewhere.
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "Customer"
)
UPDATE "Customer" c
SET "displayId" = 'CUST-' || LPAD(numbered.rn::text, 6, '0')
FROM numbered
WHERE c."id" = numbered."id";

ALTER TABLE "Customer" ALTER COLUMN "displayId" SET NOT NULL;

-- AlterTable
ALTER TABLE "JobOrder" ADD COLUMN     "productionInstructions" TEXT;

-- CreateTable
CREATE TABLE "OrderTrackingLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderTrackingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentShareLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "quotationId" TEXT,
    "orderId" TEXT,
    "jobOrderId" TEXT,
    "accessLevel" "DocumentAccessLevel" NOT NULL DEFAULT 'VIEW_ONLY',
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderTrackingLink_token_key" ON "OrderTrackingLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShareLink_token_key" ON "DocumentShareLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_displayId_key" ON "Customer"("displayId");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_contactNumber_idx" ON "Customer"("contactNumber");

-- AddForeignKey
ALTER TABLE "OrderTrackingLink" ADD CONSTRAINT "OrderTrackingLink_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTrackingLink" ADD CONSTRAINT "OrderTrackingLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
