import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

/** Cryptographically secure, unpredictable, non-sequential token for public tracking/sharing links. base64url keeps it URL-safe with no padding. */
export function generateSecureToken(): string {
  return randomBytes(24).toString("base64url");
}

export type OrderTrackingSnapshot = Prisma.OrderGetPayload<{
  include: {
    customer: true;
    quotation: true;
    jobOrders: {
      include: { workflowTemplate: { include: { stages: true } }; stageLogs: true };
    };
    fulfillments: true;
  };
}>;

export const ORDER_TRACKING_INCLUDE = {
  customer: true,
  quotation: true,
  jobOrders: {
    include: { workflowTemplate: { include: { stages: true } }, stageLogs: true },
  },
  fulfillments: true,
} satisfies Prisma.OrderInclude;

export type TimelineStep = { label: string; state: "done" | "current" | "upcoming"; date: Date | null };

export type JobOrderStageSnapshot = Prisma.JobOrderGetPayload<{
  include: { workflowTemplate: { include: { stages: true } }; stageLogs: true };
}>;

/**
 * The production-stage portion of a Job Order's progress, derived entirely
 * from its own Service's configured WorkflowTemplate/WorkflowStage sequence
 * (never a hard-coded stage list) — shared by the public tracking timeline
 * below and the Messenger Dispatch message generator, so "current stage" and
 * "step X of Y" are always computed identically everywhere from one source.
 */
export function buildJobOrderStageSteps(jo: JobOrderStageSnapshot): TimelineStep[] {
  const stages = [...jo.workflowTemplate.stages].sort((a, b) => a.order - b.order);
  return stages.map((stage) => {
    const log = jo.stageLogs.find((l) => l.stageOrder === stage.order);
    let state: TimelineStep["state"] = "upcoming";
    if (log?.status === "COMPLETED") state = "done";
    else if (stage.order === jo.currentStageOrder && jo.status !== "READY" && jo.status !== "COMPLETED" && jo.status !== "RELEASED") {
      state = "current";
    } else if (jo.status === "READY" || jo.status === "COMPLETED" || jo.status === "RELEASED") {
      state = "done";
    }
    return { label: stage.name, state, date: log?.completedAt ?? null };
  });
}

/** Job-order-level current-stage label, e.g. for the Messenger dispatch dialog (order-level equivalent is currentStageLabel below). */
export function currentStageLabelForJobOrder(jo: JobOrderStageSnapshot): string {
  if (jo.status === "READY" || jo.status === "COMPLETED" || jo.status === "RELEASED") return "Ready for Fulfillment";
  const stage = jo.workflowTemplate.stages.find((s) => s.order === jo.currentStageOrder);
  return stage?.name ?? "In Production";
}

/**
 * Customer-safe order progress timeline — reuses the real Quotation status
 * and the real JobOrder/WorkflowStage production sequence rather than a
 * separate tracking-specific status system. Only the first Job Order on the
 * order drives the production steps (the common case for this app); orders
 * with multiple job orders show the primary one's progress.
 */
export function buildOrderTimeline(order: OrderTrackingSnapshot): TimelineStep[] {
  const steps: TimelineStep[] = [{ label: "Order Received", state: "done", date: order.createdAt }];

  if (order.quotation) {
    steps.push({ label: "Quotation", state: "done", date: order.quotation.createdAt });
    steps.push({
      label: "Approved",
      state: order.quotation.status === "APPROVED" ? "done" : "upcoming",
      date: order.quotation.status === "APPROVED" ? order.quotation.updatedAt : null,
    });
  }

  const jo = order.jobOrders[0];
  steps.push({ label: "Job Order", state: jo ? "done" : "upcoming", date: jo?.createdAt ?? null });

  if (jo) {
    steps.push(...buildJobOrderStageSteps(jo));
  }

  steps.push({
    label: "Completed",
    state: order.status === "COMPLETED" ? "done" : "upcoming",
    date: order.status === "COMPLETED" ? order.completedAt : null,
  });

  return steps;
}

/** Order-level current-stage label shown at the top of the tracking page. */
export function currentStageLabel(order: OrderTrackingSnapshot): string | null {
  const jo = order.jobOrders[0];
  if (!jo) return null;
  if (order.status === "COMPLETED") return "Completed";
  if (jo.status === "READY") return "Ready for Fulfillment";
  const stage = jo.workflowTemplate.stages.find((s) => s.order === jo.currentStageOrder);
  return stage?.name ?? null;
}

export function nextExpectedDate(order: OrderTrackingSnapshot): Date | null {
  const upcoming = order.fulfillments
    .filter((f) => f.status !== "CANCELLED" && f.status !== "DELIVERED" && f.status !== "INSTALLED" && f.status !== "RECEIVED")
    .sort((a, b) => (a.scheduledDate?.getTime() ?? 0) - (b.scheduledDate?.getTime() ?? 0));
  return upcoming[0]?.scheduledDate ?? null;
}

export async function findActiveTrackingLink(orderId: string) {
  return prisma.orderTrackingLink.findFirst({
    where: { orderId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}
