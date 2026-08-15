-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('CUSTOMER', 'CUSTOMER_GROUP', 'PRIVATE', 'GROUP');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageRefType" AS ENUM ('INQUIRY', 'QUOTATION', 'JOB_ORDER');

-- CreateEnum
CREATE TYPE "StaffAssignmentMode" AS ENUM ('MANUAL', 'AUTOMATIC', 'MANUAL_WITH_AUTO_FALLBACK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'COMMUNICATION_TRANSFER';
ALTER TYPE "Permission" ADD VALUE 'COMMUNICATION_ASSIGN';
ALTER TYPE "Permission" ADD VALUE 'COMMUNICATION_GROUP';
ALTER TYPE "Permission" ADD VALUE 'COMMUNICATION_ATTACHMENT';
ALTER TYPE "Permission" ADD VALUE 'COMMUNICATION_REFERENCE_TRANSACTION';
ALTER TYPE "Permission" ADD VALUE 'COMMUNICATION_SEARCH_CUSTOMER';

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_customerId_fkey";

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "assignmentMode" "StaffAssignmentMode" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedStaffId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "lastCustomerMessageAt" TIMESTAMP(3),
ADD COLUMN     "lastReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "title" TEXT,
ADD COLUMN     "type" "ConversationType" NOT NULL DEFAULT 'CUSTOMER',
ALTER COLUMN "customerId" DROP NOT NULL,
ALTER COLUMN "subjectType" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "attachmentMime" TEXT,
ADD COLUMN     "attachmentName" TEXT,
ADD COLUMN     "attachmentPath" TEXT,
ADD COLUMN     "attachmentSize" INTEGER,
ADD COLUMN     "refInquiryId" TEXT,
ADD COLUMN     "refJobOrderId" TEXT,
ADD COLUMN     "refQuotationId" TEXT,
ADD COLUMN     "refType" "MessageRefType",
ADD COLUMN     "type" "MessageType" NOT NULL DEFAULT 'TEXT',
ALTER COLUMN "body" SET DEFAULT '';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastActiveAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "ConversationParticipant"("conversationId", "userId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_refInquiryId_fkey" FOREIGN KEY ("refInquiryId") REFERENCES "Inquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_refQuotationId_fkey" FOREIGN KEY ("refQuotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_refJobOrderId_fkey" FOREIGN KEY ("refJobOrderId") REFERENCES "JobOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

