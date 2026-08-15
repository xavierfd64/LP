-- CreateEnum
CREATE TYPE "ConversationSubjectType" AS ENUM ('INQUIRY', 'QUOTATION', 'ORDER', 'JOB_ORDER', 'GENERAL');

-- AlterTable: Quotation "Prepared By"
ALTER TABLE "Quotation" ADD COLUMN     "createdById" TEXT;

-- AlterTable: Payment reference number + explicit payment date
ALTER TABLE "Payment" ADD COLUMN     "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "referenceNumber" TEXT;

-- CreateTable: Conversation
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subjectType" "ConversationSubjectType" NOT NULL,
    "inquiryId" TEXT,
    "quotationId" TEXT,
    "orderId" TEXT,
    "jobOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ConversationRead
CREATE TABLE "ConversationRead" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationRead_conversationId_userId_key" ON "ConversationRead"("conversationId", "userId");

-- Message: migrate from a direct Order FK to a Conversation FK.
-- Add the new column as nullable first (existing rows, if any, may exist on
-- a deployed database) rather than NOT NULL, so this never fails on data.
ALTER TABLE "Message" ADD COLUMN     "conversationId" TEXT;

-- Backfill: for every Order that already has messages, create one ORDER-scoped
-- Conversation and repoint its messages at it. No-op if the table is empty.
INSERT INTO "Conversation" ("id", "customerId", "subjectType", "orderId", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || o."id"), o."customerId", 'ORDER', o."id", now()
FROM "Order" o
WHERE EXISTS (SELECT 1 FROM "Message" m WHERE m."orderId" = o."id");

UPDATE "Message" m
SET "conversationId" = c."id"
FROM "Conversation" c
WHERE c."orderId" = m."orderId" AND c."subjectType" = 'ORDER';

-- Now safe to enforce NOT NULL and drop the old column/FK.
ALTER TABLE "Message" ALTER COLUMN "conversationId" SET NOT NULL;
ALTER TABLE "Message" DROP CONSTRAINT "Message_orderId_fkey";
ALTER TABLE "Message" DROP COLUMN "orderId";

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationRead" ADD CONSTRAINT "ConversationRead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationRead" ADD CONSTRAINT "ConversationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
