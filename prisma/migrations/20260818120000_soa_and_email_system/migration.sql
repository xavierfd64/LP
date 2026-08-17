-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('GMAIL', 'YAHOO', 'OUTLOOK', 'CUSTOM_SMTP');

-- CreateEnum
CREATE TYPE "AccountAdjustmentType" AS ENUM ('CHARGE', 'CREDIT');

-- CreateEnum
CREATE TYPE "StatementDeliveryMethod" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'SOA_VIEW';
ALTER TYPE "Permission" ADD VALUE 'SOA_GENERATE';
ALTER TYPE "Permission" ADD VALUE 'SOA_SHARE';
ALTER TYPE "Permission" ADD VALUE 'SOA_REVOKE';

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailEventSettings" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "emailLastTestAt" TIMESTAMP(3),
ADD COLUMN     "emailLastTestOk" BOOLEAN,
ADD COLUMN     "emailProvider" "EmailProvider",
ADD COLUMN     "emailSenderAddress" TEXT,
ADD COLUMN     "emailSenderName" TEXT,
ADD COLUMN     "emailSmtpHost" TEXT,
ADD COLUMN     "emailSmtpPasswordEnc" TEXT,
ADD COLUMN     "emailSmtpPort" INTEGER,
ADD COLUMN     "emailSmtpSecure" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailSmtpUsername" TEXT,
ADD COLUMN     "paymentInstructions" TEXT;

-- AlterTable
ALTER TABLE "DocumentShareLink" ADD COLUMN     "statementId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "dueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AccountAdjustment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "AccountAdjustmentType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementOfAccount" (
    "id" TEXT NOT NULL,
    "statementNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingBalance" DECIMAL(12,2) NOT NULL,
    "totalCharges" DECIMAL(12,2) NOT NULL,
    "totalPayments" DECIMAL(12,2) NOT NULL,
    "adjustments" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outstandingBalance" DECIMAL(12,2) NOT NULL,
    "generatedById" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatementOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementSchedule" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "deliveryMethod" "StatementDeliveryMethod" NOT NULL DEFAULT 'EMAIL',
    "onlyIfOutstanding" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "failureReason" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatementOfAccount_statementNumber_key" ON "StatementOfAccount"("statementNumber");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

-- AddForeignKey
ALTER TABLE "DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "StatementOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAdjustment" ADD CONSTRAINT "AccountAdjustment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAdjustment" ADD CONSTRAINT "AccountAdjustment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAdjustment" ADD CONSTRAINT "AccountAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementOfAccount" ADD CONSTRAINT "StatementOfAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementOfAccount" ADD CONSTRAINT "StatementOfAccount_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementSchedule" ADD CONSTRAINT "StatementSchedule_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementSchedule" ADD CONSTRAINT "StatementSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

