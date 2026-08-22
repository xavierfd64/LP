-- CreateEnum
CREATE TYPE "CustomerFormStatus" AS ENUM ('OPEN', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "FormDeliveryMethod" AS ENUM ('EMAIL', 'MESSENGER', 'DIRECT_LINK', 'SMS');

-- CreateEnum
CREATE TYPE "FormDeliveryStatus" AS ENUM ('SENT', 'DELIVERED', 'COPIED', 'PENDING', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'FORM_VIEW';
ALTER TYPE "Permission" ADD VALUE 'FORM_CREATE';
ALTER TYPE "Permission" ADD VALUE 'FORM_MANAGE_LINK';
ALTER TYPE "Permission" ADD VALUE 'FORM_EDIT';
ALTER TYPE "Permission" ADD VALUE 'FORM_REOPEN';
ALTER TYPE "Permission" ADD VALUE 'FORM_ITEM_UNLOCK_OVERRIDE';

-- CreateTable
CREATE TABLE "CustomerForm" (
    "id" TEXT NOT NULL,
    "jobOrderId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "status" "CustomerFormStatus" NOT NULL DEFAULT 'OPEN',
    "deadline" TIMESTAMP(3),
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "lastReopenedAt" TIMESTAMP(3),
    "lastReopenedById" TEXT,
    "lastReopenReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFormItem" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "specs" JSONB,
    "notes" TEXT,
    "qty" INTEGER NOT NULL,
    "printed" BOOLEAN NOT NULL DEFAULT false,
    "printedAt" TIMESTAMP(3),
    "printedById" TEXT,
    "qcChecked" BOOLEAN NOT NULL DEFAULT false,
    "qcCheckedAt" TIMESTAMP(3),
    "qcCheckedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerFormItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFormLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFormLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFormDelivery" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "method" "FormDeliveryMethod" NOT NULL,
    "recipient" TEXT NOT NULL,
    "deliveredById" TEXT,
    "status" "FormDeliveryStatus" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFormDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFormOrder" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFormOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerForm_jobOrderId_key" ON "CustomerForm"("jobOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerFormLink_token_key" ON "CustomerFormLink"("token");

-- AddForeignKey
ALTER TABLE "CustomerForm" ADD CONSTRAINT "CustomerForm_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerForm" ADD CONSTRAINT "CustomerForm_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerForm" ADD CONSTRAINT "CustomerForm_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerForm" ADD CONSTRAINT "CustomerForm_lastReopenedById_fkey" FOREIGN KEY ("lastReopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerForm" ADD CONSTRAINT "CustomerForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFormItem" ADD CONSTRAINT "CustomerFormItem_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CustomerForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFormItem" ADD CONSTRAINT "CustomerFormItem_printedById_fkey" FOREIGN KEY ("printedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFormItem" ADD CONSTRAINT "CustomerFormItem_qcCheckedById_fkey" FOREIGN KEY ("qcCheckedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFormLink" ADD CONSTRAINT "CustomerFormLink_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CustomerForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFormLink" ADD CONSTRAINT "CustomerFormLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFormDelivery" ADD CONSTRAINT "CustomerFormDelivery_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CustomerForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFormDelivery" ADD CONSTRAINT "CustomerFormDelivery_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFormOrder" ADD CONSTRAINT "CustomerFormOrder_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CustomerForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFormOrder" ADD CONSTRAINT "CustomerFormOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFormOrder" ADD CONSTRAINT "CustomerFormOrder_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

