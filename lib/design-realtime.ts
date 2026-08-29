import { prisma } from "@/lib/prisma";
import { publishToUsers } from "@/lib/realtime";

/**
 * Everyone who can currently see a Design queue — every active Graphic
 * Artist (STAFF with DESIGN_VIEW), everyone who can manage/reassign design
 * work (STAFF with DESIGN_MANAGE), and ADMIN (always passes both via
 * can()'s bypass) — mirrors lib/production-realtime.ts's audience query
 * exactly, scoped to the Design permissions instead of PRODUCTION_VIEW.
 */
async function designAudienceUserIds(): Promise<string[]> {
  const [admins, designStaff] = await Promise.all([
    prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } }),
    prisma.user.findMany({
      where: {
        role: "STAFF",
        active: true,
        staffPermissions: { some: { permission: { in: ["DESIGN_VIEW", "DESIGN_MANAGE"] } } },
      },
      select: { id: true },
    }),
  ]);
  return [...admins, ...designStaff].map((u) => u.id);
}

/**
 * Fire-and-forget push telling every authorized Design viewer's open tab
 * to refetch — call this after any write that changes what a Design
 * queue/dashboard shows (a job order entering Design, auto-assignment,
 * manual assignment/unassignment, accept, start, complete). No payload,
 * same reasoning as publishProductionUpdate. Critically, this must fire
 * even when no specific artist is the target (e.g. a brand-new unassigned
 * design job with automatic assignment off) — that case has no natural
 * notifyUser recipient, so without this broadcast no Graphic Artist's
 * already-open dashboard would ever learn the job exists until they
 * manually reload.
 */
export async function publishDesignUpdate(): Promise<void> {
  const ids = await designAudienceUserIds();
  publishToUsers(ids, { type: "design" });
}
