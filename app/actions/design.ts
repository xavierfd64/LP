"use server";

import { requirePermission, can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { setStageLogStatus, completeCurrentStage, RuleViolation } from "@/lib/workflow";
import { getDesignJobDetail, type DesignJobOrderDetail } from "@/lib/design-dashboard-data";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Details popup data fetch — a thin permission-checked wrapper so the
 * client-side modal can call it directly rather than needing the page to
 * pre-fetch every row's full detail up front. */
export async function getDesignJobDetailAction(stageLogId: string): Promise<DesignJobOrderDetail | null> {
  await requirePermission("DESIGN_VIEW");
  return getDesignJobDetail(stageLogId);
}

/**
 * The Graphic Artist design workflow — deliberately its own action file
 * (not folded into app/actions/production.ts) even though every mutation
 * below ends up calling the exact same lib/workflow.ts primitives
 * Production's Kanban uses (setStageLogStatus, completeCurrentStage): the
 * *engine* is shared (one order lifecycle, no parallel Design state
 * machine), but the *authorization* must not be — these check DESIGN_VIEW/
 * DESIGN_MANAGE, never PRODUCTION_*, so granting a Graphic Artist their
 * default responsibility can never imply Production Kanban access.
 */

async function requireDesignStageLog(stageLogId: string) {
  const log = await prisma.jobOrderStageLog.findUnique({ where: { id: stageLogId } });
  if (!log) throw new RuleViolation("Design job not found.");
  if (!log.isDesignStage) throw new RuleViolation("This is not a design-stage job.");
  return log;
}

/**
 * "Accept Job" — claims an unassigned, waiting design job without starting
 * it yet (Waiting/Lined Up -> Accepted/Assigned, per the workflow this
 * dashboard implements). Self-service only: a Graphic Artist accepts for
 * themselves, never on someone else's behalf (that's assignDesignJobAction,
 * gated by DESIGN_MANAGE).
 */
export async function acceptDesignJobAction(stageLogId: string): Promise<ActionResult> {
  const user = await requirePermission("DESIGN_VIEW");
  try {
    const log = await requireDesignStageLog(stageLogId);
    if (log.status !== "READY") throw new RuleViolation("This job is no longer waiting to be accepted.");
    if (log.assignedToId) {
      throw new RuleViolation(
        log.assignedToId === user.id ? "You've already accepted this job." : "This job has already been accepted by another Graphic Artist."
      );
    }

    await prisma.jobOrderStageLog.update({ where: { id: stageLogId }, data: { assignedToId: user.id } });
    await logAudit(user.id, "DESIGN_JOB_ACCEPTED", "JobOrderStageLog", stageLogId, { stage: log.stageName });
    return { ok: true };
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * "Start Design" — Accepted/Assigned -> In Progress. Also covers the
 * "self-accept and start in one click" case: if the job is still
 * unassigned, this claims it for the caller in the same step, exactly the
 * way lib/workflow.ts's setStageLogStatus already assigns whoever starts a
 * production stage (reused here unchanged).
 */
export async function startDesignAction(stageLogId: string): Promise<ActionResult> {
  const user = await requirePermission("DESIGN_VIEW");
  try {
    const log = await requireDesignStageLog(stageLogId);
    if (log.status !== "READY") throw new RuleViolation("This job isn't ready to start.");
    if (log.assignedToId && log.assignedToId !== user.id) {
      throw new RuleViolation("This job is assigned to another Graphic Artist.");
    }

    await setStageLogStatus(stageLogId, "IN_PROGRESS", user.id);
    return { ok: true };
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * "Complete Design" — advances the job order through the real order
 * lifecycle via the unchanged production engine (completeCurrentStage),
 * so this only ever moves the *design responsibility* forward to whatever
 * the workflow template's next real stage is; it can never mark the whole
 * order complete, skip a stage, or otherwise diverge from what Production
 * Kanban itself would do completing the same stage.
 */
export async function completeDesignAction(jobOrderId: string, stageLogId: string, notes?: string): Promise<ActionResult> {
  const user = await requirePermission("DESIGN_VIEW");
  try {
    const log = await requireDesignStageLog(stageLogId);
    if (log.status !== "IN_PROGRESS") throw new RuleViolation("This job isn't in progress yet.");
    if (log.assignedToId !== user.id && !(await can(user, "DESIGN_MANAGE"))) {
      throw new RuleViolation("This job is assigned to another Graphic Artist.");
    }

    await completeCurrentStage(jobOrderId, stageLogId, user.id, notes);
    return { ok: true };
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
}

export type GraphicArtistOption = { id: string; name: string; pendingCount: number };

/** Active Graphic Artists (STAFF with DESIGN_VIEW) with their current
 * pending-layout count, for the manual-assignment picker — same
 * "prefer whoever has less on their plate" context the auto-assignment
 * logic uses, surfaced to a human making the same call manually. */
export async function getGraphicArtistsAction(): Promise<GraphicArtistOption[]> {
  await requirePermission("DESIGN_MANAGE");
  const artists = await prisma.user.findMany({
    where: { role: "STAFF", active: true, staffPermissions: { some: { permission: "DESIGN_VIEW" } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const loads = await prisma.jobOrderStageLog.groupBy({
    by: ["assignedToId"],
    where: { isDesignStage: true, status: { not: "COMPLETED" }, assignedToId: { in: artists.map((a) => a.id) } },
    _count: { _all: true },
  });
  const loadById = new Map(loads.map((l) => [l.assignedToId as string, l._count._all]));
  return artists.map((a) => ({ id: a.id, name: a.name, pendingCount: loadById.get(a.id) ?? 0 }));
}

/**
 * Admin/authorized-Staff manual assignment ("B. Manual assignment" in the
 * workflow spec) — distinct permission (DESIGN_MANAGE) from the
 * self-service actions above, since assigning *other people's* work is a
 * lead/admin capability, not something every Graphic Artist should be
 * able to do to each other.
 */
export async function assignDesignJobAction(stageLogId: string, graphicArtistId: string): Promise<ActionResult> {
  const user = await requirePermission("DESIGN_MANAGE");
  try {
    const log = await requireDesignStageLog(stageLogId);
    if (log.status === "COMPLETED") throw new RuleViolation("This job has already been completed.");

    const artist = await prisma.user.findUnique({ where: { id: graphicArtistId } });
    if (!artist || !artist.active || artist.role !== "STAFF" || !(await can(artist, "DESIGN_VIEW"))) {
      throw new RuleViolation("Please select a valid, active Graphic Artist.");
    }

    await prisma.jobOrderStageLog.update({ where: { id: stageLogId }, data: { assignedToId: graphicArtistId } });
    await logAudit(user.id, "DESIGN_JOB_ASSIGNED", "JobOrderStageLog", stageLogId, { stage: log.stageName, assignedToId: graphicArtistId, assignedBy: user.id });

    const jobOrder = await prisma.jobOrder.findUnique({ where: { id: log.jobOrderId }, select: { joNumber: true } });
    await notifyUser(
      graphicArtistId,
      "DESIGN_JOB_ASSIGNED",
      `${user.name} assigned you a layout: ${jobOrder?.joNumber ?? "a job order"} (${log.stageName}).`,
      `/design-queue`
    );

    return { ok: true };
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
}

/** Un-assign back to the open pool (DESIGN_MANAGE) — the counterpart to
 * assignDesignJobAction, e.g. if the wrong person was picked. Only valid
 * before the job has started, mirroring "you can accept a READY job" —
 * pulling a stage someone is actively IN_PROGRESS on out from under them
 * needs the (separate, deliberate) reassignment story production stages
 * already have, which is out of scope for this narrower action. */
export async function unassignDesignJobAction(stageLogId: string): Promise<ActionResult> {
  const user = await requirePermission("DESIGN_MANAGE");
  try {
    const log = await requireDesignStageLog(stageLogId);
    if (log.status !== "READY") throw new RuleViolation("Only a job that hasn't started yet can be unassigned.");
    await prisma.jobOrderStageLog.update({ where: { id: stageLogId }, data: { assignedToId: null } });
    await logAudit(user.id, "DESIGN_JOB_UNASSIGNED", "JobOrderStageLog", stageLogId, { stage: log.stageName });
    return { ok: true };
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
}
