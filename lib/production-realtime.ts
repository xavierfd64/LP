import { prisma } from "@/lib/prisma";
import { publishToUsers } from "@/lib/realtime";

/**
 * Every user who can currently view the Production module — the same
 * audience app/(app)/production/page.tsx and board/[key]/page.tsx already
 * gate on (ADMIN, PRODUCTION role, and STAFF granted PRODUCTION_VIEW) — so
 * a production change reaches exactly the people who could otherwise see
 * it, no more (3rd Update item 2: "synchronize between authorized active
 * users").
 */
async function productionAudienceUserIds(): Promise<string[]> {
  const [adminsAndProduction, staffWithView] = await Promise.all([
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "PRODUCTION"] }, active: true }, select: { id: true } }),
    prisma.user.findMany({
      where: { role: "STAFF", active: true, staffPermissions: { some: { permission: "PRODUCTION_VIEW" } } },
      select: { id: true },
    }),
  ]);
  return [...adminsAndProduction, ...staffWithView].map((u) => u.id);
}

/**
 * Fire-and-forget push telling every authorized Production viewer's open
 * tab to refetch — call this after any write that changes what the
 * Production board/dashboard/side panel shows (stage moves, returns,
 * starts, Add Job, reassignment, order/job-order completion). No payload:
 * see RealtimeProductionEvent's doc comment for why a bare signal is
 * enough here.
 */
export async function publishProductionUpdate(): Promise<void> {
  const ids = await productionAudienceUserIds();
  publishToUsers(ids, { type: "production" });
}
