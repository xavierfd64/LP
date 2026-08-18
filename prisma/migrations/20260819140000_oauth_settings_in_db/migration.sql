-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "facebookClientId" TEXT,
ADD COLUMN     "facebookClientSecretEnc" TEXT,
ADD COLUMN     "googleClientId" TEXT,
ADD COLUMN     "googleClientSecretEnc" TEXT;
