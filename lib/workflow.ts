import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

export class RuleViolation extends Error {}

/** Sum of CONFIRMED payments on an order. */
export async function confirmedPaymentTotal(orderId: string): Promise<number> {
  const agg = await prisma.payment.aggregate({
    where: { orderId, status: "CONFIRMED" },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

export async function paymentSummary(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const confirmed = await confirmedPaymentTotal(orderId);
  const total = Number(order.totalAmount);
  const requiredPartial = total * (order.requiredPartialPct / 100);
  const hasApprovedTerms = order.paymentTermType === "APPROVED_TERMS" && !!order.termsApprovedBy;
  return {
    order,
    total,
    confirmed,
    requiredPartial,
    partialMet: confirmed >= requiredPartial,
    fullyPaid: confirmed >= total,
    hasApprovedTerms,
  };
}

/** Rule #1: a JobOrder cannot leave ON_HOLD without partial payment or an approved-terms exception. */
export async function assertCanStartProduction(orderId: string) {
  const s = await paymentSummary(orderId);
  if (s.hasApprovedTerms) return s;
  if (!s.partialMet) {
    throw new RuleViolation(
      `On hold: requires ${s.requiredPartial.toFixed(2)} confirmed partial payment (has ${s.confirmed.toFixed(2)}), or an approved payment-terms exception.`
    );
  }
  return s;
}

/** Rule #2: a JobOrder cannot be RELEASED without full payment or an authorized release exception. */
export async function assertCanRelease(orderId: string) {
  const s = await paymentSummary(orderId);
  const order = s.order;
  if (order.releaseException && order.releaseExceptionBy) return s;
  if (!s.fullyPaid) {
    throw new RuleViolation(
      `Cannot release: full payment required (${s.confirmed.toFixed(2)} of ${s.total.toFixed(2)} confirmed), or an authorized release exception.`
    );
  }
  return s;
}

export async function getTemplateStages(templateId: string) {
  return prisma.workflowStage.findMany({
    where: { templateId },
    orderBy: { order: "asc" },
  });
}

/**
 * Move a JobOrder from ON_HOLD into production: creates the first stage log
 * (READY) and flips status to IN_PROGRESS. Enforces Rule #1.
 */
export async function startProduction(jobOrderId: string, actorId: string | null) {
  const jo = await prisma.jobOrder.findUniqueOrThrow({ where: { id: jobOrderId } });
  if (jo.status !== "ON_HOLD") throw new RuleViolation("Job order is not ON_HOLD.");

  await assertCanStartProduction(jo.orderId);

  const stages = await getTemplateStages(jo.workflowTemplateId);
  const first = stages[0];
  if (!first) throw new RuleViolation("Workflow template has no stages.");

  await prisma.$transaction([
    prisma.jobOrder.update({
      where: { id: jobOrderId },
      data: { status: "IN_PROGRESS", currentStageOrder: first.order },
    }),
    prisma.jobOrderStageLog.create({
      data: {
        jobOrderId,
        stageName: first.name,
        stageOrder: first.order,
        status: "READY",
      },
    }),
  ]);

  const { logAudit } = await import("@/lib/audit");
  await logAudit(actorId, "START_PRODUCTION", "JobOrder", jobOrderId, { stage: first.name });
}

/**
 * Advance a JobOrder's current (non-QC) stage log to COMPLETED and open the
 * next stage. If the next stage is the QC stage, JO status becomes QC. If
 * the current stage was the last stage, JO status becomes READY (for
 * fulfillment). Enforces Rule #4 (strict order — always +1, never skips).
 */
export async function completeCurrentStage(
  jobOrderId: string,
  stageLogId: string,
  actorId: string | null,
  notes?: string
) {
  const jo = await prisma.jobOrder.findUniqueOrThrow({ where: { id: jobOrderId } });
  const log = await prisma.jobOrderStageLog.findUniqueOrThrow({ where: { id: stageLogId } });
  if (log.jobOrderId !== jobOrderId) throw new RuleViolation("Stage log mismatch.");
  if (log.stageOrder !== jo.currentStageOrder) {
    throw new RuleViolation("This stage is not the job order's current stage.");
  }
  if (jo.status !== "IN_PROGRESS" && jo.status !== "REWORK") {
    throw new RuleViolation("Job order is not in a workable stage.");
  }

  const stages = await getTemplateStages(jo.workflowTemplateId);
  const currentIdx = stages.findIndex((s) => s.order === jo.currentStageOrder);
  const next = stages[currentIdx + 1];

  const isReworkCompletion = jo.status === "REWORK";

  await prisma.$transaction(async (tx) => {
    await tx.jobOrderStageLog.update({
      where: { id: stageLogId },
      data: { status: "COMPLETED", completedAt: new Date(), notes },
    });

    if (isReworkCompletion) {
      // Rework done -> re-enter QC at whatever stage is flagged isQCStage.
      const qcStage = stages.find((s) => s.isQCStage);
      if (!qcStage) throw new RuleViolation("Template has no QC stage configured.");
      await tx.jobOrder.update({
        where: { id: jobOrderId },
        data: { status: "QC", currentStageOrder: qcStage.order },
      });
      await tx.jobOrderStageLog.create({
        data: { jobOrderId, stageName: qcStage.name, stageOrder: qcStage.order, status: "READY" },
      });
      await tx.reworkRecord.updateMany({
        where: { jobOrderId, status: { in: ["OPEN", "IN_PROGRESS"] } },
        data: { status: "DONE" },
      });
      return;
    }

    if (!next) {
      // Last stage completed -> ready for fulfillment.
      await tx.jobOrder.update({
        where: { id: jobOrderId },
        data: { status: "READY" },
      });
      return;
    }

    if (next.isQCStage) {
      await tx.jobOrder.update({
        where: { id: jobOrderId },
        data: { status: "QC", currentStageOrder: next.order },
      });
      await tx.jobOrderStageLog.create({
        data: { jobOrderId, stageName: next.name, stageOrder: next.order, status: "READY" },
      });
      return;
    }

    await tx.jobOrder.update({
      where: { id: jobOrderId },
      data: { currentStageOrder: next.order },
    });
    await tx.jobOrderStageLog.create({
      data: { jobOrderId, stageName: next.name, stageOrder: next.order, status: "READY" },
    });
  });

  const { logAudit } = await import("@/lib/audit");
  await logAudit(actorId, "STAGE_COMPLETED", "JobOrder", jobOrderId, {
    stage: log.stageName,
    reworkCompletion: isReworkCompletion,
  });
  if (isReworkCompletion) {
    await logAudit(actorId, "REWORK_CLOSED", "JobOrder", jobOrderId, { stage: log.stageName });
  }
}

export async function setStageLogStatus(
  stageLogId: string,
  status: "READY" | "IN_PROGRESS" | "COMPLETED",
  actorId: string
) {
  const data: Prisma.JobOrderStageLogUpdateInput = { status, assignedTo: { connect: { id: actorId } } };
  if (status === "IN_PROGRESS") data.startedAt = new Date();
  const log = await prisma.jobOrderStageLog.update({ where: { id: stageLogId }, data });

  const { logAudit } = await import("@/lib/audit");
  await logAudit(actorId, "STAGE_STATUS_UPDATED", "JobOrder", log.jobOrderId, {
    stage: log.stageName,
    status,
  });
}

/**
 * Record a QCResult at a JobOrder's QC stage.
 * PASS: closes out the QC stage log and advances to the next stage (or
 * READY, for fulfillment, if QC was the last stage) — Rule #4.
 * FAIL: always creates a ReworkRecord and routes the JO back to the
 * responsible stage, blocking forward progress until rework passes QC
 * again — Rule #3.
 */
export async function recordQCResult(
  jobOrderId: string,
  actorId: string,
  input: {
    result: "PASS" | "FAIL";
    quantityChecked: number;
    quantityFailed: number;
    defectNotes?: string;
    assignedStage?: string;
  }
) {
  const jo = await prisma.jobOrder.findUniqueOrThrow({ where: { id: jobOrderId } });
  if (jo.status !== "QC") throw new RuleViolation("Job order is not at the QC stage.");

  const stages = await getTemplateStages(jo.workflowTemplateId);
  const qcStage = stages.find((s) => s.isQCStage);
  if (!qcStage || qcStage.order !== jo.currentStageOrder) {
    throw new RuleViolation("QC stage mismatch for this job order.");
  }

  const currentLog = await prisma.jobOrderStageLog.findFirst({
    where: { jobOrderId, stageOrder: qcStage.order, status: { not: "COMPLETED" } },
    orderBy: { createdAt: "desc" },
  });

  const { logAudit } = await import("@/lib/audit");

  const qc = await prisma.qCResult.create({
    data: {
      jobOrderId,
      stageName: qcStage.name,
      inspectorId: actorId,
      result: input.result,
      quantityChecked: input.quantityChecked,
      quantityFailed: input.quantityFailed,
      defectNotes: input.defectNotes,
    },
  });

  await logAudit(actorId, "QC_RESULT_RECORDED", "JobOrder", jobOrderId, {
    result: input.result,
    quantityChecked: input.quantityChecked,
    quantityFailed: input.quantityFailed,
  });

  await prisma.$transaction(async (tx) => {
    if (currentLog) {
      await tx.jobOrderStageLog.update({
        where: { id: currentLog.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }

    if (input.result === "FAIL") {
      const idx = stages.findIndex((s) => s.order === qcStage.order);
      const fallback = stages[idx - 1] ?? qcStage;
      const assignedStageObj = stages.find((s) => s.name === input.assignedStage) ?? fallback;

      await tx.reworkRecord.create({
        data: {
          qcResultId: qc.id,
          jobOrderId,
          defectDescription: input.defectNotes || "Failed QC inspection.",
          quantityAffected: input.quantityFailed,
          assignedStage: assignedStageObj.name,
          status: "OPEN",
        },
      });
      await tx.jobOrder.update({
        where: { id: jobOrderId },
        data: { status: "REWORK", currentStageOrder: assignedStageObj.order },
      });
      await tx.jobOrderStageLog.create({
        data: {
          jobOrderId,
          stageName: assignedStageObj.name,
          stageOrder: assignedStageObj.order,
          status: "READY",
        },
      });
      return;
    }

    // PASS
    const idx = stages.findIndex((s) => s.order === qcStage.order);
    const next = stages[idx + 1];
    if (!next) {
      await tx.jobOrder.update({ where: { id: jobOrderId }, data: { status: "READY" } });
      return;
    }
    await tx.jobOrder.update({
      where: { id: jobOrderId },
      data: { status: "IN_PROGRESS", currentStageOrder: next.order },
    });
    await tx.jobOrderStageLog.create({
      data: { jobOrderId, stageName: next.name, stageOrder: next.order, status: "READY" },
    });
  });

  if (input.result === "FAIL") {
    await logAudit(actorId, "REWORK_CREATED", "JobOrder", jobOrderId, {
      assignedStage: input.assignedStage,
      quantityAffected: input.quantityFailed,
    });
  }
}
