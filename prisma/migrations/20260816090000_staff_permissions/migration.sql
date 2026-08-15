-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('INQUIRY_VIEW', 'INQUIRY_HANDLE', 'INQUIRY_MODIFY', 'INQUIRY_CANCEL', 'QUOTATION_VIEW', 'QUOTATION_CREATE', 'QUOTATION_EDIT', 'QUOTATION_SEND', 'QUOTATION_HANDLE_MODIFICATION', 'QUOTATION_APPROVE_REJECT', 'QUOTATION_CANCEL', 'ORDER_VIEW', 'ORDER_CREATE', 'ORDER_MODIFY', 'ORDER_HANDLE_MODIFICATION', 'ORDER_UPDATE_STATUS', 'ORDER_CANCEL', 'PAYMENT_VIEW', 'PAYMENT_RECORD', 'PAYMENT_VERIFY', 'PAYMENT_REJECT', 'PAYMENT_EDIT', 'PAYMENT_REFUND', 'PRODUCTION_VIEW', 'PRODUCTION_UPDATE_STAGE', 'PRODUCTION_MARK_STAGE_COMPLETE', 'PRODUCTION_MARK_COMPLETE', 'FULFILLMENT_VIEW', 'FULFILLMENT_SCHEDULE_PICKUP', 'FULFILLMENT_SCHEDULE_DELIVERY', 'FULFILLMENT_UPDATE_DELIVERY_STATUS', 'FULFILLMENT_MARK_DELIVERED', 'FULFILLMENT_MARK_INSTALLED', 'REWARDS_VIEW', 'REWARDS_PROCESS_REDEMPTION', 'REWARDS_MANAGE_CONFIG', 'COMMUNICATION_VIEW', 'COMMUNICATION_SEND', 'COMMUNICATION_MANAGE', 'REPORTS_VIEW', 'REPORTS_EXPORT', 'CUSTOMER_VIEW', 'CUSTOMER_CREATE', 'CUSTOMER_EDIT', 'CUSTOMER_ACTIVATE_DEACTIVATE', 'USER_VIEW', 'USER_CREATE', 'USER_EDIT', 'USER_ACTIVATE_DEACTIVATE', 'USER_MANAGE_PERMISSIONS');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "StaffPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "Permission" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffPermission_userId_permission_key" ON "StaffPermission"("userId", "permission");

-- AddForeignKey
ALTER TABLE "StaffPermission" ADD CONSTRAINT "StaffPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: grant every existing STAFF user every permission, so introducing
-- the granular permission system does not silently strip access from anyone
-- who could already do everything a STAFF role could do. Admin can dial
-- individual staff back afterward from the new Staff & Permissions page.
-- New STAFF accounts created after this migration start with zero granted
-- permissions until Admin explicitly assigns some.
INSERT INTO "StaffPermission" ("id", "userId", "permission")
SELECT md5(random()::text || clock_timestamp()::text || u."id" || perm.value), u."id", perm.value
FROM "User" u
CROSS JOIN unnest(enum_range(NULL::"Permission")) AS perm(value)
WHERE u."role" = 'STAFF';
