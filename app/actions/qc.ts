"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/permissions-guard";
import { recordQCResult, RuleViolation } from "@/lib/workflow";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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

// ---------------------------------------------------------------------------
// Per-item QC Checklist sourced from the submitted Customer Form (spec
// item 9) — reuses CustomerFormItem directly (no second, duplicated QC
// data structure) and, on completion, delegates to the exact same
// recordQCResult the simple aggregate QCForm above already uses, so the
// underlying stage-progression/rework machinery in lib/workflow.ts is
// never duplicated or bypassed.
// ---------------------------------------------------------------------------

export async function toggleFormItemQcCheckedAction(itemId: string) {
  const user = await requirePermission("PRODUCTION_MARK_COMPLETE", ["PRODUCTION"]);
  const item = await prisma.customerFormItem.findUniqueOrThrow({ where: { id: itemId }, include: { form: true } });

  await prisma.customerFormItem.update({
    where: { id: itemId },
    data: item.qcChecked
      ? { qcChecked: false, qcCheckedAt: null, qcCheckedById: null }
      : { qcChecked: true, qcCheckedAt: new Date(), qcCheckedById: user.id },
  });
  revalidatePath(`/job-orders/${item.form.jobOrderId}/qc-checklist`);
}

export async function completeQcFromFormAction(jobOrderId: string, formData: FormData) {
  const user = await requirePermission("PRODUCTION_MARK_COMPLETE", ["PRODUCTION"]);
  const form = await prisma.customerForm.findUnique({ where: { jobOrderId }, include: { items: true } });
  if (!form) redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent("No customer form is linked to this job order.")}`);

  const quantityChecked = form.items.filter((i) => i.qcChecked).reduce((sum, i) => sum + i.qty, 0);
  const defectNotes = (formData.get("notes") as string) || undefined;

  if (quantityChecked <= 0) {
    redirect(`/job-orders/${jobOrderId}/qc-checklist?error=${encodeURIComponent("Check at least one item before completing QC.")}`);
  }

  try {
    await recordQCResult(jobOrderId, user.id, { result: "PASS", quantityChecked, quantityFailed: 0, defectNotes });
  } catch (e) {
    if (e instanceof RuleViolation) {
      redirect(`/job-orders/${jobOrderId}/qc-checklist?error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }

  redirect(`/job-orders/${jobOrderId}`);
}
