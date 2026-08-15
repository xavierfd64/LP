"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/permissions-guard";
import { setStageLogStatus, completeCurrentStage, RuleViolation } from "@/lib/workflow";

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
