-- Business timezone (IANA name) — single source of truth for how the app
-- displays "local" business time throughout. Read once at server start by
-- instrumentation.ts, which sets process.env.TZ before any request is
-- served.
ALTER TABLE "BusinessSettings" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila';
