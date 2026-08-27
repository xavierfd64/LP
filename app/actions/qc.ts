"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/permissions-guard";
import { recordQCResult, RuleViolation } from "@/lib/workflow";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { publishProductionUpdate } from "@/lib/production-realtime";

export type QCActionResult = { ok: true } | { ok: false; error: string };

export type QCPopupData =
  | {
      mode: "checklist";
      jobOrder: {
        id: string;
        joNumber: string;
        productType: string;
        customerName: string;
        quantity: number;
        deadline: string | null;
        startedAt: string | null;
        assignedToName: string | null;
      };
      items: {
        id: string;
        name: string;
        qty: number;
        specs: Record<string, string>;
        qcChecked: boolean;
        qcCheckedAt: string | null;
        qcCheckedByName: string | null;
      }[];
    }
  | {
      mode: "simple";
      jobOrderId: string;
      quantity: number;
      stages: { name: string; order: number }[];
      defaultAssignedStage: string | null;
    };

/**
 * Backs the QC popup/modal (1st Update item 2) — decides, exactly like
 * app/(app)/job-orders/[id]/page.tsx already did inline, whether this job
 * order has a per-item Customer Form QC Checklist (Jersey orders and any
 * other product with a submitted Customer Form) or falls back to the
 * simple aggregate QCForm. Same two existing QC implementations either
 * way — this only decides which one the popup shows, never a third.
 */
export async function getQCPopupDataAction(jobOrderId: string): Promise<QCPopupData | null> {
  await requirePermission("PRODUCTION_MARK_COMPLETE", ["PRODUCTION"]);

  const jo = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    include: {
      order: { include: { customer: true } },
      workflowTemplate: { include: { stages: { orderBy: { order: "asc" } } } },
      stageLogs: { where: { status: "IN_PROGRESS" }, orderBy: { createdAt: "desc" }, take: 1, include: { assignedTo: true } },
      customerForm: { include: { items: { orderBy: { sortOrder: "asc" }, include: { qcCheckedBy: true } } } },
    },
  });
  if (!jo) return null;

  if (jo.customerForm && jo.customerForm.items.length > 0) {
    return {
      mode: "checklist",
      jobOrder: {
        id: jo.id,
        joNumber: jo.joNumber,
        productType: jo.productType,
        customerName: jo.order.customer.name,
        quantity: jo.quantity,
        deadline: jo.deadline ? jo.deadline.toISOString() : null,
        startedAt: jo.stageLogs[0]?.createdAt ? jo.stageLogs[0].createdAt.toISOString() : null,
        assignedToName: jo.stageLogs[0]?.assignedTo?.name ?? null,
      },
      items: jo.customerForm.items.map((i) => ({
        id: i.id,
        name: i.name,
        qty: i.qty,
        specs: (i.specs as Record<string, string> | null) ?? {},
        qcChecked: i.qcChecked,
        qcCheckedAt: i.qcCheckedAt ? i.qcCheckedAt.toISOString() : null,
        qcCheckedByName: i.qcCheckedBy?.name ?? null,
      })),
    };
  }

  return {
    mode: "simple",
    jobOrderId: jo.id,
    quantity: jo.quantity,
    stages: jo.workflowTemplate.stages.filter((s) => !s.isQCStage).map((s) => ({ name: s.name, order: s.order })),
    defaultAssignedStage: jo.workflowTemplate.stages.find((s) => s.order === jo.currentStageOrder - 1)?.name ?? null,
  };
}

async function runRecordQCResult(
  jobOrderId: string,
  actorId: string,
  input: { result: "PASS" | "FAIL"; quantityChecked: number; quantityFailed: number; defectNotes?: string; assignedStage?: string }
): Promise<QCActionResult> {
  if (!input.quantityChecked || input.quantityChecked <= 0) return { ok: false, error: "Enter the quantity checked." };
  if (input.result === "FAIL" && (!input.quantityFailed || input.quantityFailed <= 0)) {
    return { ok: false, error: "Enter the quantity failed." };
  }
  try {
    await recordQCResult(jobOrderId, actorId, input);
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
  await publishProductionUpdate();
  return { ok: true };
}

/**
 * Non-redirecting counterpart to recordQCResultAction below, for the QC
 * popup/modal (1st Update item 2) — same recordQCResult call, just
 * returning a result instead of navigating away so the modal can close
 * itself and refresh the board in place.
 */
export async function recordQCResultFromBoardAction(
  jobOrderId: string,
  input: { result: "PASS" | "FAIL"; quantityChecked: number; quantityFailed: number; defectNotes?: string; assignedStage?: string }
): Promise<QCActionResult> {
  const user = await requirePermission("PRODUCTION_MARK_COMPLETE", ["PRODUCTION"]);
  return runRecordQCResult(jobOrderId, user.id, input);
}

export async function recordQCResultAction(jobOrderId: string, formData: FormData) {
  const user = await requirePermission("PRODUCTION_MARK_COMPLETE", ["PRODUCTION"]);

  const result = formData.get("result") === "FAIL" ? "FAIL" : "PASS";
  const quantityChecked = Number(formData.get("quantityChecked") ?? 0);
  const quantityFailed = result === "FAIL" ? Number(formData.get("quantityFailed") ?? 0) : 0;
  const defectNotes = (formData.get("defectNotes") as string) || undefined;
  const assignedStage = (formData.get("assignedStage") as string) || undefined;

  const outcome = await runRecordQCResult(jobOrderId, user.id, { result, quantityChecked, quantityFailed, defectNotes, assignedStage });
  if (!outcome.ok) redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent(outcome.error)}`);

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

async function runCompleteQcFromForm(jobOrderId: string, actorId: string, notes?: string): Promise<QCActionResult> {
  const form = await prisma.customerForm.findUnique({ where: { jobOrderId }, include: { items: true } });
  if (!form) return { ok: false, error: "No customer form is linked to this job order." };

  const quantityChecked = form.items.filter((i) => i.qcChecked).reduce((sum, i) => sum + i.qty, 0);
  if (quantityChecked <= 0) return { ok: false, error: "Check at least one item before completing QC." };

  try {
    await recordQCResult(jobOrderId, actorId, { result: "PASS", quantityChecked, quantityFailed: 0, defectNotes: notes });
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
  await publishProductionUpdate();
  return { ok: true };
}

/** Non-redirecting counterpart to completeQcFromFormAction below, for the QC popup/modal's per-item checklist view. */
export async function completeQcFromFormBoardAction(jobOrderId: string, notes?: string): Promise<QCActionResult> {
  const user = await requirePermission("PRODUCTION_MARK_COMPLETE", ["PRODUCTION"]);
  return runCompleteQcFromForm(jobOrderId, user.id, notes);
}

export async function completeQcFromFormAction(jobOrderId: string, formData: FormData) {
  const user = await requirePermission("PRODUCTION_MARK_COMPLETE", ["PRODUCTION"]);
  const notes = (formData.get("notes") as string) || undefined;
  const outcome = await runCompleteQcFromForm(jobOrderId, user.id, notes);
  if (!outcome.ok) redirect(`/job-orders/${jobOrderId}/qc-checklist?error=${encodeURIComponent(outcome.error)}`);

  redirect(`/job-orders/${jobOrderId}`);
}
