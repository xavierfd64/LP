-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "businessName" TEXT NOT NULL DEFAULT 'LP Printing',
    "tagline" TEXT,
    "description" TEXT,
    "logoPath" TEXT,
    "faviconPath" TEXT,
    "contactNumber" TEXT,
    "email" TEXT,
    "facebookUrl" TEXT,
    "website" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton row so the app always has a BusinessSettings record to
-- read (getBusinessSettings() still falls back gracefully if this were ever
-- missing, but there's no reason to make every caller handle that).
INSERT INTO "BusinessSettings" ("id", "businessName", "tagline", "updatedAt")
VALUES ('default', 'LP Printing', 'Business Management System', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
