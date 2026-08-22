/**
 * Runs once when the server starts (Next.js instrumentation hook), before
 * the first request is served. Reads the configured business timezone
 * (Business Settings → Regional) and sets process.env.TZ to it.
 *
 * Why this fixes the whole app at once: every existing formatDate/
 * formatDateTime call (lib/utils.ts) and every un-timezone-qualified Date
 * computation ("today" boundaries in lib/dashboard-data.ts, report period
 * ranges, etc.) already relies on the JS runtime's *default* timezone —
 * they just never had one configured, so they fell back to the container's
 * timezone (effectively UTC), which is what produced timestamps several
 * hours off from Philippine local time. Setting process.env.TZ here makes
 * that default correct everywhere, with no changes needed at any of those
 * call sites — a second, per-call `timeZone` parameter would have meant
 * touching dozens of files with real risk of missing one.
 *
 * Trade-off, stated plainly: changing the timezone in Business Settings
 * only takes effect on the next server start/redeploy, since env vars are
 * read once here, not on every request. Acceptable for a setting that
 * changes essentially never after initial setup, and it's the same
 * "changes need a redeploy" model this app already uses for real env vars.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.businessSettings.findUnique({ where: { id: "default" }, select: { timezone: true } });
    process.env.TZ = row?.timezone || "Asia/Manila";
  } catch {
    // Database not reachable yet (e.g. mid-build, or first boot before the
    // BusinessSettings row exists) — fall back to the same default the
    // schema/UI already use, rather than leaving TZ unset.
    process.env.TZ = process.env.TZ || "Asia/Manila";
  }
}
