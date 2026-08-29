import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";

/**
 * THE single source of truth for "who is an eligible Graphic Artist" —
 * active STAFF granted DESIGN_VIEW. Every place in the app that needs this
 * list (auto-assignment's candidate pool, the Design Queue's manual-assign
 * picker, the Production Kanban's Design-stage assign/reassign dropdowns)
 * calls this same function rather than re-deriving the condition, so the
 * eligibility rule can never drift between them.
 */
export async function getEligibleGraphicArtists(): Promise<{ id: string; name: string }[]> {
  return prisma.user.findMany({
    where: {
      role: "STAFF",
      active: true,
      staffPermissions: { some: { permission: "DESIGN_VIEW" } },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Ranked by "pending layout" — the count of this person's own design-stage
 * JobOrderStageLogs that aren't COMPLETED yet — lowest first, so a
 * Graphic Artist with nothing queued is always preferred over one who's
 * busy (the system owner's explicit instruction), never randomly. Ties
 * (including the common "everyone's at zero" case) break on name for a
 * deterministic, repeatable — not random — choice.
 */
async function pickEligibleGraphicArtist(): Promise<string | null> {
  const eligible = await getEligibleGraphicArtists();
  if (eligible.length === 0) return null;

  const loads = await prisma.jobOrderStageLog.groupBy({
    by: ["assignedToId"],
    where: {
      isDesignStage: true,
      status: { not: "COMPLETED" },
      assignedToId: { in: eligible.map((s) => s.id) },
    },
    _count: { _all: true },
  });
  const loadByStaff = new Map(loads.map((l) => [l.assignedToId as string, l._count._all]));

  const ranked = eligible
    .map((s) => ({ id: s.id, name: s.name, load: loadByStaff.get(s.id) ?? 0 }))
    .sort((a, b) => a.load - b.load || a.name.localeCompare(b.name));

  return ranked[0]?.id ?? null;
}

/**
 * Called right after a Design-stage JobOrderStageLog is created READY and
 * unassigned (see lib/workflow.ts's three call sites — a job order
 * starting on Design, advancing into it, or QC routing rework back to
 * it), when Business Settings has "Auto-Select Graphic Artist" enabled.
 * Assigns but deliberately leaves status READY — the Graphic Artist still
 * explicitly "Starts" it (see app/actions/design.ts), matching the same
 * "assignment isn't automatically also starting the work" distinction
 * lib/workflow.ts's own startProduction already draws for its
 * assigneeId option. No-op (leaves it open for self-acceptance or manual
 * assignment) if the setting is off or no eligible Graphic Artist exists.
 */
export async function autoAssignDesignStage(stageLogId: string) {
  const settings = await prisma.businessSettings.findUnique({ where: { id: "default" }, select: { autoAssignGraphicArtist: true } });
  if (!settings?.autoAssignGraphicArtist) return;

  const log = await prisma.jobOrderStageLog.findUnique({ where: { id: stageLogId } });
  if (!log || !log.isDesignStage || log.assignedToId || log.status !== "READY") return;

  const artistId = await pickEligibleGraphicArtist();
  if (!artistId) return;

  await prisma.jobOrderStageLog.update({ where: { id: stageLogId }, data: { assignedToId: artistId } });

  const { logAudit } = await import("@/lib/audit");
  await logAudit(null, "DESIGN_JOB_AUTO_ASSIGNED", "JobOrderStageLog", stageLogId, { assignedToId: artistId, stage: log.stageName });

  const jobOrder = await prisma.jobOrder.findUnique({ where: { id: log.jobOrderId }, select: { joNumber: true } });
  await notifyUser(
    artistId,
    "DESIGN_JOB_ASSIGNED",
    `A new layout was automatically assigned to you: ${jobOrder?.joNumber ?? "a job order"} (${log.stageName}).`,
    `/design-queue`
  );
}
