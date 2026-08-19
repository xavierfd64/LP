-- CreateEnum
CREATE TYPE "PricingMethod" AS ENUM ('NONE', 'PER_PIECE', 'FIXED', 'PER_SET', 'PER_AREA');

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountLabel" TEXT,
ADD COLUMN     "isInstant" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subtotal" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "basePrice" DECIMAL(12,2),
ADD COLUMN     "instantQuoteEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minQuantity" INTEGER,
ADD COLUMN     "pricingMethod" "PricingMethod" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "Pricelist" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "minQty" INTEGER NOT NULL,
    "maxQty" INTEGER,
    "pricePerUnit" DECIMAL(12,2),
    "discountPercent" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pricelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceId" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "minQty" INTEGER,
    "maxQty" INTEGER,
    "percentDiscount" DECIMAL(5,2),
    "fixedDiscount" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pricelist_serviceId_idx" ON "Pricelist"("serviceId");

-- CreateIndex
CREATE INDEX "Promotion_serviceId_idx" ON "Promotion"("serviceId");

-- CreateIndex
CREATE INDEX "Promotion_active_idx" ON "Promotion"("active");

-- AddForeignKey
ALTER TABLE "Pricelist" ADD CONSTRAINT "Pricelist_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
