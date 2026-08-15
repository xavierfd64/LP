"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/permissions-guard";
import { recordQCResult, RuleViolation } from "@/lib/workflow";

export async function recordQCResultAction(jobOrderId: string, formData: FormData) {
  const user = await requirePermission("PRODUCTION_MARK_COMPLETE", ["PRODUCTION"]);

  const result = formData.get("result") === "FAIL" ? "FAIL" : "PASS";
  const quantityChecked = Number(formData.get("quantityChecked") ?? 0);
  const quantityFailed = result === "FAIL" ? Number(formData.get("quantityFailed") ?? 0) : 0;
  const defectNotes = (formData.get("defectNotes") as string) || undefined;
  const assignedStage = (formData.get("assignedStage") as string) || undefined;

  if (!quantityChecked || quantityChecked <= 0) {
    redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent("Enter the quantity checked.")}`);
  }
  if (result === "FAIL" && (!quantityFailed || quantityFailed <= 0)) {
    redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent("Enter the quantity failed.")}`);
  }

  try {
    await recordQCResult(jobOrderId, user.id, { result, quantityChecked, quantityFailed, defectNotes, assignedStage });
  } catch (e) {
    if (e instanceof RuleViolation) {
      redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }

  redirect(`/job-orders/${jobOrderId}`);
}
