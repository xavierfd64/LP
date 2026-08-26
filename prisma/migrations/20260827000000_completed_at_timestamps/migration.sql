-- 3rd Update / audit item: a genuine, dedicated completion timestamp —
-- separate from updatedAt, which any later unrelated edit would otherwise
-- bump, silently corrupting "completed today/this period" queries.
ALTER TABLE "Order" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "JobOrder" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Backfill: for already-COMPLETED rows, the best available approximation
-- of when completion happened is the row's current updatedAt (its most
-- recent write, which for most historical rows was in fact the
-- completion write itself) — better than leaving genuinely-completed
-- historical records with no completion date at all.
UPDATE "Order" SET "completedAt" = "updatedAt" WHERE status = 'COMPLETED' AND "completedAt" IS NULL;
UPDATE "JobOrder" SET "completedAt" = "updatedAt" WHERE status = 'COMPLETED' AND "completedAt" IS NULL;
