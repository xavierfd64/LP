"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/permissions-guard";
import { setStageLogStatus, completeCurrentStage, revertStageChange, RuleViolation, type StageChangeUndo } from "@/lib/workflow";

export async function markStageInProgressAction(stageLogId: string) {
  const user = await requirePermission("PRODUCTION_UPDATE_STAGE", ["PRODUCTION"]);
  await setStageLogStatus(stageLogId, "IN_PROGRESS", user.id);
  redirect(`/production`);
}

export async function completeStageAction(jobOrderId: string, stageLogId: string, formData: FormData) {
  const user = await requirePermission("PRODUCTION_MARK_STAGE_COMPLETE", ["PRODUCTION"]);
  const notes = (formData.get("notes") as string) || undefined;

  try {
    await completeCurrentStage(jobOrderId, stageLogId, user.id, notes);
  } catch (e) {
    if (e instanceof RuleViolation) {
      redirect(`/production?error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }

  redirect(`/production`);
}

export type MoveStageResult = { ok: true; undo: StageChangeUndo } | { ok: false; error: string };

/**
 * Non-redirecting counterpart to completeStageAction (Aug 19 1st update) —
 * used by both the Kanban's drag-and-drop and its rewritten "Next" button,
 * so a client-side toast can offer Undo instead of a full page navigation.
 * `expectedTargetStageOrder` is how invalid drag targets get rejected
 * server-side (see completeCurrentStage's own doc comment) — the one rule
 * engine both interaction paths share, never a second, looser client-only
 * check.
 */
export async function moveStageAction(
  jobOrderId: string,
  stageLogId: string,
  expectedTargetStageOrder?: number | null,
  notes?: string
): Promise<MoveStageResult> {
  const user = await requirePermission("PRODUCTION_MARK_STAGE_COMPLETE", ["PRODUCTION"]);
  try {
    const undo = await completeCurrentStage(jobOrderId, stageLogId, user.id, notes, expectedTargetStageOrder);
    return { ok: true, undo };
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
}

export type RevertStageResult = { ok: true } | { ok: false; error: string };

export async function revertStageAction(undo: StageChangeUndo): Promise<RevertStageResult> {
  const user = await requirePermission("PRODUCTION_MARK_STAGE_COMPLETE", ["PRODUCTION"]);
  try {
    await revertStageChange(undo, user.id);
    return { ok: true };
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
}
