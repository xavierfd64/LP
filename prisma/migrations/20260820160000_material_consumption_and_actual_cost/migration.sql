-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'CONSUME_REVERSAL';

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "consumptionRecordId" TEXT;

-- CreateTable
CREATE TABLE "JobOrderMaterialConsumption" (
    "id" TEXT NOT NULL,
    "jobOrderId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "expectedQty" DECIMAL(12,4),
    "actualQty" DECIMAL(12,4) NOT NULL,
    "unitCostSnapshot" DECIMAL(12,4),
    "totalCostSnapshot" DECIMAL(12,2),
    "varianceReason" TEXT,
    "notes" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobOrderMaterialConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobOrderMaterialConsumption_jobOrderId_idx" ON "JobOrderMaterialConsumption"("jobOrderId");

-- CreateIndex
CREATE INDEX "JobOrderMaterialConsumption_inventoryItemId_idx" ON "JobOrderMaterialConsumption"("inventoryItemId");

-- CreateIndex
CREATE INDEX "InventoryMovement_consumptionRecordId_idx" ON "InventoryMovement"("consumptionRecordId");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_consumptionRecordId_fkey" FOREIGN KEY ("consumptionRecordId") REFERENCES "JobOrderMaterialConsumption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderMaterialConsumption" ADD CONSTRAINT "JobOrderMaterialConsumption_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderMaterialConsumption" ADD CONSTRAINT "JobOrderMaterialConsumption_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderMaterialConsumption" ADD CONSTRAINT "JobOrderMaterialConsumption_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderMaterialConsumption" ADD CONSTRAINT "JobOrderMaterialConsumption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
