-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'USER_RESET_PASSWORD';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
