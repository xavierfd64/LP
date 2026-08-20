-- CreateEnum
CREATE TYPE "ServiceCostCategory" AS ENUM ('LABOR', 'MACHINE', 'FINISHING', 'OTHER');

-- CreateEnum
CREATE TYPE "CostComponentBasis" AS ENUM ('PER_UNIT', 'PER_HOUR', 'FLAT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "costSnapshotFullyConfigured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "costSnapshotTakenAt" TIMESTAMP(3),
ADD COLUMN     "estimatedProductionCostSnapshot" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "targetMarginPct" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "ServiceBOMMaterial" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "consumptionPerUnit" DECIMAL(12,4) NOT NULL,
    "wastePercent" DECIMAL(5,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBOMMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCostComponent" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "category" "ServiceCostCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "basis" "CostComponentBasis" NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "estimatedHours" DECIMAL(8,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCostComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceBOMMaterial_serviceId_idx" ON "ServiceBOMMaterial"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceBOMMaterial_inventoryItemId_idx" ON "ServiceBOMMaterial"("inventoryItemId");

-- CreateIndex
CREATE INDEX "ServiceCostComponent_serviceId_idx" ON "ServiceCostComponent"("serviceId");

-- AddForeignKey
ALTER TABLE "ServiceBOMMaterial" ADD CONSTRAINT "ServiceBOMMaterial_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBOMMaterial" ADD CONSTRAINT "ServiceBOMMaterial_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCostComponent" ADD CONSTRAINT "ServiceCostComponent_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
