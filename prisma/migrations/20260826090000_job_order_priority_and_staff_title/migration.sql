-- CreateEnum
CREATE TYPE "JobOrderPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "JobOrder" ADD COLUMN "priority" "JobOrderPriority" NOT NULL DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "title" TEXT;
