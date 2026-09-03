
-- CreateEnum
CREATE TYPE "MessengerStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'SERVICE_VIEW';
ALTER TYPE "Permission" ADD VALUE 'SERVICE_MANAGE';

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "messengerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "messengerEventSettings" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "messengerPageAccessTokenEnc" TEXT,
ADD COLUMN     "messengerPageId" TEXT,
ADD COLUMN     "messengerVerifyToken" TEXT;

-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "serviceId" TEXT,
ADD COLUMN     "specs" JSONB;

-- AlterTable
ALTER TABLE "JobOrder" ADD COLUMN     "serviceId" TEXT,
ADD COLUMN     "specs" JSONB;

-- AlterTable
ALTER TABLE "QuotationLineItem" ADD COLUMN     "serviceId" TEXT,
ADD COLUMN     "specs" JSONB;

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "workflowTemplateId" TEXT,
    "specFields" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessengerConnection" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "optinRef" TEXT NOT NULL,
    "psid" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessengerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessengerLog" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "status" "MessengerStatus" NOT NULL DEFAULT 'QUEUED',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "MessengerLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_name_key" ON "Service"("name");

-- CreateIndex
CREATE INDEX "Service_active_idx" ON "Service"("active");

-- CreateIndex
CREATE UNIQUE INDEX "MessengerConnection_customerId_key" ON "MessengerConnection"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "MessengerConnection_optinRef_key" ON "MessengerConnection"("optinRef");

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLineItem" ADD CONSTRAINT "QuotationLineItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_workflowTemplateId_fkey" FOREIGN KEY ("workflowTemplateId") REFERENCES "WorkflowTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerConnection" ADD CONSTRAINT "MessengerConnection_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerLog" ADD CONSTRAINT "MessengerLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
