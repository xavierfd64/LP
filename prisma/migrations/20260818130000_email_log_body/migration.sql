-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "bodyHtml" TEXT NOT NULL DEFAULT '';

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'EMAIL_LOG_VIEW';
