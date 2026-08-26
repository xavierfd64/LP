"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/permissions-guard";
import {
  setStageLogStatus,
  completeCurrentStage,
  revertStageChange,
  returnToPreviousStage,
  startProduction,
  RuleViolation,
  type StageChangeUndo,
} from "@/lib/workflow";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { nextJoNumber } from "@/lib/numbering";
import { publishProductionUpdate } from "@/lib/production-realtime";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Start the job's current stage (READY -> IN_PROGRESS stage-log status —
 * the "Start {stage}" button). Previously this redirected to /production
 * on success (`redirect("/production")`), which was the actual root cause
 * of the reported "Next Stage sometimes returns to the Overview, sometimes
 * doesn't" inconsistency: a freshly-opened stage log starts READY and used
 * this redirecting action, while every other stage transition
 * (moveStageAction, revertStageAction, returnToPreviousStageAction) was
 * already non-redirecting and stayed on the focused board — the
 * difference was purely which action a given card's current log status
 * happened to route through, not anything about the workflow itself.
 * Matches those other actions' shape exactly so the board can call it the
 * same way (client onClick + router.refresh(), no page navigation).
 */
export async function startStageAction(stageLogId: string): Promise<ActionResult> {
  const user = await requirePermission("PRODUCTION_UPDATE_STAGE", ["PRODUCTION"]);
  try {
    await setStageLogStatus(stageLogId, "IN_PROGRESS", user.id);
    await publishProductionUpdate();
    return { ok: true };
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
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

  await publishProductionUpdate();
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
    await publishProductionUpdate();
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
    await publishProductionUpdate();
    return { ok: true };
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * "Return to Previous Process" (Production UI job card/side panel More
 * Actions + illustration 8B) — the always-available counterpart to the
 * transient 10-second Undo toast above. See lib/workflow.ts's
 * returnToPreviousStage for the full rule set (locked/completed jobs
 * blocked, no skipping past a stage the job was never actually logged at,
 * reason required).
 */
export async function returnToPreviousStageAction(jobOrderId: string, reason: string): Promise<ActionResult> {
  const user = await requirePermission("PRODUCTION_MARK_STAGE_COMPLETE", ["PRODUCTION"]);
  try {
    await returnToPreviousStage(jobOrderId, user.id, reason);
    await publishProductionUpdate();
    return { ok: true };
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Reassign the currently-open stage log to a different production staff
 * member (job card/side panel "Reassign", spec item 4/5). Deliberately
 * narrow — only the log matching the job order's *current* stage can be
 * reassigned (an already-completed stage's assignedToId is a historical
 * record, not a live assignment) — mirrors the same "current stage log"
 * precondition every other stage action already uses.
 */
export async function reassignStageAction(jobOrderId: string, assigneeId: string | null): Promise<ActionResult> {
  const user = await requirePermission("PRODUCTION_UPDATE_STAGE", ["PRODUCTION"]);
  const jo = await prisma.jobOrder.findUnique({ where: { id: jobOrderId } });
  if (!jo) return { ok: false, error: "Job order not found." };

  const currentLog = await prisma.jobOrderStageLog.findFirst({
    where: { jobOrderId, stageOrder: jo.currentStageOrder, status: { not: "COMPLETED" } },
    orderBy: { createdAt: "desc" },
  });
  if (!currentLog) return { ok: false, error: "This job order has no active stage to reassign." };

  if (assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: assigneeId } });
    if (!assignee || !assignee.active || assignee.role !== "PRODUCTION") {
      return { ok: false, error: "Please select a valid, active production staff member." };
    }
  }

  await prisma.jobOrderStageLog.update({ where: { id: currentLog.id }, data: { assignedToId: assigneeId } });
  await logAudit(user.id, "STAGE_REASSIGNED", "JobOrder", jobOrderId, { stage: currentLog.stageName, assigneeId });
  await publishProductionUpdate();
  return { ok: true };
}

/**
 * Duplicate Job (job card More Actions, spec item 4: "Duplicate Job where
 * supported"). Creates a fresh ON_HOLD job order on the same parent order
 * with the same service/spec/quantity/description — never a copy already
 * "in production," so it lands back in the same eligible pool the Add Job
 * dialog draws from, exactly like a normal newly-created job order.
 */
export async function duplicateJobOrderAction(jobOrderId: string): Promise<ActionResult> {
  const user = await requirePermission("ORDER_MODIFY");
  const jo = await prisma.jobOrder.findUnique({ where: { id: jobOrderId }, include: { order: true } });
  if (!jo) return { ok: false, error: "Job order not found." };
  if (jo.order.status === "CANCELLED") return { ok: false, error: "This order is cancelled." };

  const joNumber = await nextJoNumber(jo.orderId);
  const duplicate = await prisma.jobOrder.create({
    data: {
      orderId: jo.orderId,
      joNumber,
      productType: jo.productType,
      serviceId: jo.serviceId,
      specs: jo.specs ?? undefined,
      description: jo.description,
      quantity: jo.quantity,
      workflowTemplateId: jo.workflowTemplateId,
      deadline: jo.deadline,
      productionInstructions: jo.productionInstructions,
      status: "ON_HOLD",
    },
  });

  await logAudit(user.id, "JOB_ORDER_DUPLICATED", "JobOrder", duplicate.id, { fromJobOrderId: jobOrderId, joNumber });
  await publishProductionUpdate();
  return { ok: true };
}

export type EligibleJobOrder = {
  id: string;
  joNumber: string;
  orderNumber: string;
  customerName: string;
  productType: string;
  serviceId: string | null;
  quantity: number;
  deadline: string | null;
  overdue: boolean;
  priority: "LOW" | "MEDIUM" | "HIGH";
};

/**
 * The Add Job dialog's eligible-job-order pool (spec item 8, step 2 +
 * validation "the job is not already active in production"): every
 * non-cancelled order's ON_HOLD job orders — i.e. exactly the same
 * "hasn't started production yet" set `startProductionAction` already
 * requires, just listable instead of looked-up-by-id. Optionally narrowed
 * to one service (the Add Job dialog pre-filters to whichever board it was
 * opened from).
 */
export async function getEligibleJobOrdersAction(serviceId?: string): Promise<EligibleJobOrder[]> {
  await requirePermission("PRODUCTION_UPDATE_STAGE", ["PRODUCTION"]);
  const jobOrders = await prisma.jobOrder.findMany({
    where: { status: "ON_HOLD", order: { status: { not: "CANCELLED" } }, ...(serviceId ? { serviceId } : {}) },
    include: { order: { include: { customer: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const now = Date.now();
  return jobOrders.map((jo) => ({
    id: jo.id,
    joNumber: jo.joNumber,
    orderNumber: jo.order.orderNumber,
    customerName: jo.order.customer.name,
    productType: jo.productType,
    serviceId: jo.serviceId,
    quantity: jo.quantity,
    deadline: jo.deadline ? jo.deadline.toISOString() : null,
    overdue: !!jo.deadline && jo.deadline.getTime() < now,
    priority: jo.priority,
  }));
}

export type ProductionStaffOption = { id: string; name: string };

/** Active PRODUCTION-role accounts — the assignable pool for the Add Job dialog and Reassign (spec items 5/4). */
export async function getProductionStaffAction(): Promise<ProductionStaffOption[]> {
  await requirePermission("PRODUCTION_UPDATE_STAGE", ["PRODUCTION"]);
  const users = await prisma.user.findMany({
    where: { role: "PRODUCTION", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return users;
}

export type JobOrderPanelData = {
  id: string;
  joNumber: string;
  productType: string;
  quantity: number;
  deadline: string | null;
  overdue: boolean;
  createdAt: string;
  status: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  orderId: string;
  orderNumber: string;
  customerName: string;
  progressPct: number;
  stages: { name: string; order: number; state: "done" | "current" | "upcoming"; isQCStage: boolean }[];
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  assignedStaffTitle: string | null;
  canReturnToPrevious: boolean;
  previousStageName: string | null;
  files: { id: string; filename: string; category: string; isApproved: boolean; uploadedByName: string; createdAt: string; path: string }[];
  customerForm: { id: string; title: string; status: string; itemCount: number } | null;
  qcChecklist: { hasChecklist: boolean; itemCount: number; checkedCount: number } | null;
  history: { id: string; action: string; actorName: string; createdAt: string; changes: Record<string, unknown> | null }[];
};

/**
 * Consolidated fetch for the Job Details Side Panel (spec item 5) — one
 * call on open covering every tab (Overview/Customer Form/Files/QC
 * Checklist/History), so opening the panel from a Kanban card never
 * requires navigating away from the board first. Read-only: every action
 * the panel exposes (move/return/reassign/etc.) goes through the same
 * dedicated actions above, never a bespoke write path here.
 */
export async function getJobOrderPanelDataAction(jobOrderId: string): Promise<JobOrderPanelData | null> {
  await requirePermission("PRODUCTION_VIEW", ["PRODUCTION"]);

  const jo = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    include: {
      order: { include: { customer: true } },
      workflowTemplate: { include: { stages: { orderBy: { order: "asc" } } } },
      stageLogs: { orderBy: { createdAt: "desc" }, include: { assignedTo: true } },
      files: { orderBy: [{ category: "asc" }, { version: "desc" }], include: { uploadedBy: true } },
      customerForm: { include: { items: true } },
    },
  });
  if (!jo) return null;

  const stages = jo.workflowTemplate.stages;
  const currentIdx = stages.findIndex((s) => s.order === jo.currentStageOrder);
  const isDone = jo.status === "READY" || jo.status === "RELEASED" || jo.status === "COMPLETED";
  const progressPct = stages.length > 0 ? (isDone ? 100 : Math.round((Math.max(0, currentIdx) / stages.length) * 100)) : 0;

  const currentLog = jo.stageLogs.find((l) => l.stageOrder === jo.currentStageOrder && l.status !== "COMPLETED");
  const previous = currentIdx > 0 ? stages[currentIdx - 1] : null;
  const currentLogOpen = jo.stageLogs.find((l) => l.stageOrder === jo.currentStageOrder && l.status !== "COMPLETED");
  const previousCompletedLog = previous
    ? jo.stageLogs.find((l) => l.stageOrder === previous.order && l.status === "COMPLETED")
    : null;
  const canReturnToPrevious = !isDone && !!previous && !!currentLogOpen && !!previousCompletedLog;

  const auditRows = await prisma.auditLog.findMany({
    where: { entityType: "JobOrder", entityId: jobOrderId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: true },
  });

  return {
    id: jo.id,
    joNumber: jo.joNumber,
    productType: jo.productType,
    quantity: jo.quantity,
    deadline: jo.deadline ? jo.deadline.toISOString() : null,
    overdue: !!jo.deadline && jo.deadline.getTime() < Date.now() && !isDone,
    createdAt: jo.createdAt.toISOString(),
    status: jo.status,
    priority: jo.priority,
    orderId: jo.orderId,
    orderNumber: jo.order.orderNumber,
    customerName: jo.order.customer.name,
    progressPct,
    stages: stages.map((s, i) => ({
      name: s.name,
      order: s.order,
      isQCStage: s.isQCStage,
      state: isDone || i < currentIdx ? "done" : i === currentIdx ? "current" : "upcoming",
    })),
    assignedStaffId: currentLog?.assignedToId ?? null,
    assignedStaffName: currentLog?.assignedTo?.name ?? null,
    assignedStaffTitle: currentLog?.assignedTo?.title ?? null,
    canReturnToPrevious,
    previousStageName: previous?.name ?? null,
    files: jo.files.map((f) => ({
      id: f.id,
      filename: f.filename,
      category: f.category,
      isApproved: f.isApproved,
      uploadedByName: f.uploadedBy.name,
      createdAt: f.createdAt.toISOString(),
      path: f.path,
    })),
    customerForm: jo.customerForm
      ? { id: jo.customerForm.id, title: jo.customerForm.title, status: jo.customerForm.status, itemCount: jo.customerForm.items.length }
      : null,
    qcChecklist: jo.customerForm
      ? {
          hasChecklist: jo.customerForm.items.length > 0,
          itemCount: jo.customerForm.items.length,
          checkedCount: jo.customerForm.items.filter((i) => i.qcChecked).length,
        }
      : null,
    history: auditRows.map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.actor?.name ?? "System",
      createdAt: a.createdAt.toISOString(),
      changes: (a.changes as Record<string, unknown> | null) ?? null,
    })),
  };
}

export type AddJobToProductionInput = {
  jobOrderId: string;
  initialStageOrder: number;
  assigneeId?: string | null;
};

/**
 * Add Job dialog's final "Add Job" step (spec item 8). Thin validation +
 * delegation wrapper around lib/workflow.ts's startProduction — the one
 * real rule engine for "move a job order into production," shared with the
 * pre-existing Order-detail "Start Production" button so the dialog can
 * never bypass a rule that path enforces (payment-terms gate, ON_HOLD-only,
 * cancelled-order guard).
 */
export async function addJobToProductionAction(input: AddJobToProductionInput): Promise<ActionResult> {
  const user = await requirePermission("PRODUCTION_UPDATE_STAGE", ["PRODUCTION"]);
  const jo = await prisma.jobOrder.findUnique({ where: { id: input.jobOrderId }, include: { order: true } });
  if (!jo) return { ok: false, error: "Job order not found." };
  if (jo.order.status === "CANCELLED") return { ok: false, error: "This order has been cancelled." };
  if (jo.status !== "ON_HOLD") return { ok: false, error: "This job order is already in production." };

  if (input.assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId } });
    if (!assignee || !assignee.active || assignee.role !== "PRODUCTION") {
      return { ok: false, error: "Please select a valid, active production staff member." };
    }
  }

  try {
    await startProduction(jo.id, user.id, { initialStageOrder: input.initialStageOrder, assigneeId: input.assigneeId ?? undefined });
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }
  await publishProductionUpdate();
  return { ok: true };
}
