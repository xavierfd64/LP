-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'CANCEL';

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'SUPPLIER_VIEW';
ALTER TYPE "Permission" ADD VALUE 'SUPPLIER_MANAGE';
ALTER TYPE "Permission" ADD VALUE 'PURCHASE_MANAGE';
ALTER TYPE "Permission" ADD VALUE 'INVENTORY_COST_VIEW';

-- AlterTable: preserve existing free-text supplier values by renaming the
-- column rather than dropping it (Part C item 29 — existing inventory
-- records must remain usable). New structured purchases use supplierId.
ALTER TABLE "SupplyLot" RENAME COLUMN "supplier" TO "supplierName";
ALTER TABLE "SupplyLot" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "referenceNumber" TEXT,
ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "unitCost" DECIMAL(12,4);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "SupplyLot_supplierId_idx" ON "SupplyLot"("supplierId");

-- AddForeignKey
ALTER TABLE "SupplyLot" ADD CONSTRAINT "SupplyLot_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyLot" ADD CONSTRAINT "SupplyLot_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
