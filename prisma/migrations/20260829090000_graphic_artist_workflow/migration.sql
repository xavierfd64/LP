-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'DESIGN_VIEW';
ALTER TYPE "Permission" ADD VALUE 'DESIGN_MANAGE';

-- AlterTable
ALTER TABLE "WorkflowStage" ADD COLUMN     "isDesignStage" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "JobOrderStageLog" ADD COLUMN     "isDesignStage" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "autoAssignGraphicArtist" BOOLEAN NOT NULL DEFAULT false;
