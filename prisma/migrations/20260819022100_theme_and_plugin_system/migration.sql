-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "activeTheme" TEXT NOT NULL DEFAULT '2026',
ADD COLUMN     "themeColorOverrides" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "themeFontFamily" TEXT NOT NULL DEFAULT 'montserrat';

-- CreateTable
CREATE TABLE "InstalledTheme" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "author" TEXT,
    "description" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installedById" TEXT,

    CONSTRAINT "InstalledTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstalledPlugin" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "author" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installedById" TEXT,

    CONSTRAINT "InstalledPlugin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstalledTheme_slug_key" ON "InstalledTheme"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "InstalledPlugin_slug_key" ON "InstalledPlugin"("slug");

-- AddForeignKey
ALTER TABLE "InstalledTheme" ADD CONSTRAINT "InstalledTheme_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledPlugin" ADD CONSTRAINT "InstalledPlugin_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
