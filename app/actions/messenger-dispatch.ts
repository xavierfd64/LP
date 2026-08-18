"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";
import { getBusinessSettings } from "@/lib/business-settings";
import { messengerOptinLink, sendManualMessengerDispatch } from "@/lib/messenger";
import { findActiveTrackingLink, buildJobOrderStageSteps, currentStageLabelForJobOrder } from "@/lib/order-tracking";
import { generateDispatchMessage } from "@/lib/messenger-dispatch";
import { generateTrackingLinkAction } from "@/app/actions/order-tracking";

/**
 * Backing actions for the Production Kanban's Messenger Dispatch dialog
 * (5th update). Deliberately does not duplicate anything that already
 * exists: tracking-link creation reuses generateTrackingLinkAction as-is,
 * the actual send reuses lib/messenger.ts's real Meta Send API path, and
 * "already sent" history rides on the existing AuditLog (so it also shows
 * up for free in the Order page's Transaction History card).
 */

// How long a "you already sent an update for this stage" warning stays
// active — a deliberate, disclosed default (not specified by the spec),
// long enough to catch accidental double-clicks/refreshes without blocking
// a legitimate follow-up message minutes later.
const DUPLICATE_GUARD_WINDOW_MS = 15 * 60 * 1000;

export type MessengerDispatchContext = {
  jobOrderId: string;
  joNumber: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  businessName: string;
  serviceName: string;
  quantity: number;
  currentStage: string;
  stepIndex: number;
  totalSteps: number;
  generatedMessage: string;
  trackingUrl: string | null;
  hasTrackingLink: boolean;
  messengerConfigured: boolean;
  customerConnected: boolean;
  openMessengerHref: string | null;
  recentDispatch: { stage: string; status: string; at: string } | null;
};

/** Loads everything the dialog needs the moment it's opened from a Kanban card — no separate customer lookup, per spec item 24. */
export async function getMessengerDispatchContextAction(jobOrderId: string): Promise<MessengerDispatchContext> {
  await requirePermission("MESSENGER_DISPATCH");

  const jo = await prisma.jobOrder.findUniqueOrThrow({
    where: { id: jobOrderId },
    include: {
      order: { include: { customer: true } },
      service: true,
      workflowTemplate: { include: { stages: true } },
      stageLogs: true,
    },
  });

  const steps = buildJobOrderStageSteps(jo);
  const currentIdx = steps.findIndex((s) => s.state === "current");
  const doneCount = steps.filter((s) => s.state === "done").length;
  const stepIndex = currentIdx >= 0 ? currentIdx + 1 : doneCount || (steps.length > 0 ? 1 : 0);
  const currentStage = currentStageLabelForJobOrder(jo);

  const [settings, connection, activeLink, recentAudit] = await Promise.all([
    getBusinessSettings(),
    prisma.messengerConnection.findUnique({ where: { customerId: jo.order.customerId } }),
    findActiveTrackingLink(jo.orderId),
    prisma.auditLog.findFirst({
      where: {
        entityType: "JobOrder",
        entityId: jobOrderId,
        action: "MESSENGER_DISPATCH",
        createdAt: { gt: new Date(Date.now() - DUPLICATE_GUARD_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const trackingUrl = activeLink ? `${base}/track/${activeLink.token}` : null;
  const messengerConfigured = !!(settings.messengerEnabled && settings.messengerPageId && settings.messengerPageAccessTokenEnc);
  const customerConnected = !!(connection?.connected && connection.psid);
  const openMessengerHref = await messengerOptinLink(jo.order.customerId);
  const serviceName = jo.service?.name ?? jo.productType;

  const generatedMessage = generateDispatchMessage({
    businessName: settings.businessName,
    orderNumber: jo.order.orderNumber,
    joNumber: jo.joNumber,
    customerName: jo.order.customer.name,
    serviceName,
    quantity: jo.quantity,
    currentStage,
    stepIndex,
    totalSteps: steps.length,
    trackingUrl,
  });

  const recentChanges = (recentAudit?.changes as { stage?: string; status?: string } | null) ?? null;

  return {
    jobOrderId: jo.id,
    joNumber: jo.joNumber,
    orderId: jo.orderId,
    orderNumber: jo.order.orderNumber,
    customerId: jo.order.customerId,
    customerName: jo.order.customer.name,
    businessName: settings.businessName,
    serviceName,
    quantity: jo.quantity,
    currentStage,
    stepIndex,
    totalSteps: steps.length,
    generatedMessage,
    trackingUrl,
    hasTrackingLink: !!activeLink,
    messengerConfigured,
    customerConnected,
    openMessengerHref,
    recentDispatch:
      recentAudit && recentChanges?.stage === currentStage
        ? { stage: currentStage, status: recentChanges?.status ?? "Sent", at: recentAudit.createdAt.toISOString() }
        : null,
  };
}

/** Generates a tracking link without leaving the dialog (spec item 10) — reuses the exact same creation path as the Order/Job Order pages' "Generate Tracking Link", not a second implementation. */
export async function generateTrackingLinkForDispatchAction(orderId: string): Promise<{ url: string }> {
  const fd = new FormData();
  fd.set("expiresOption", "none");
  await generateTrackingLinkAction(orderId, fd);

  const link = await findActiveTrackingLink(orderId);
  if (!link) throw new Error("Failed to generate a tracking link.");
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return { url: `${base}/track/${link.token}` };
}

export type DispatchSendResult =
  | { status: "SENT" }
  | { status: "FAILED"; reason: string }
  | { status: "SKIPPED"; reason: string }
  | { status: "DUPLICATE_GUARD"; recentAt: string };

/** The actual "Send via Messenger" dispatch — permission-gated, idempotency-guarded (spec item 30), and always leaves a real audit + MessengerLog trail rather than claiming success it didn't confirm (spec items 18/34). */
export async function sendMessengerDispatchAction(
  jobOrderId: string,
  message: string,
  stage: string,
  force = false
): Promise<DispatchSendResult> {
  const user = await requirePermission("MESSENGER_DISPATCH");

  const jo = await prisma.jobOrder.findUniqueOrThrow({
    where: { id: jobOrderId },
    include: { order: { include: { customer: true } } },
  });

  if (!force) {
    const recent = await prisma.auditLog.findFirst({
      where: {
        entityType: "JobOrder",
        entityId: jobOrderId,
        action: "MESSENGER_DISPATCH",
        createdAt: { gt: new Date(Date.now() - DUPLICATE_GUARD_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    const recentChanges = (recent?.changes as { stage?: string; status?: string } | null) ?? null;
    if (recent && recentChanges?.stage === stage && recentChanges?.status === "Sent") {
      return { status: "DUPLICATE_GUARD", recentAt: recent.createdAt.toISOString() };
    }
  }

  const result = await sendManualMessengerDispatch(jo.order.customerId, message, { type: "JobOrder", id: jobOrderId });

  await logAudit(user.id, "MESSENGER_DISPATCH", "JobOrder", jobOrderId, {
    stage,
    orderId: jo.orderId,
    status: result.status === "SENT" ? "Sent" : result.status === "FAILED" ? "Failed" : "Skipped",
    reason: result.status === "SENT" ? undefined : result.reason,
  });

  if (result.status === "SENT") return { status: "SENT" };
  if (result.status === "FAILED") return { status: "FAILED", reason: result.reason };
  return { status: "SKIPPED", reason: result.reason };
}

/** Records that Staff copied the formatted message (spec item 29's "Copied" status) — doesn't count toward the send-side duplicate guard, since copying never reaches the customer by itself. */
export async function recordMessengerCopyAction(jobOrderId: string, stage: string): Promise<void> {
  const user = await requirePermission("MESSENGER_DISPATCH");
  await logAudit(user.id, "MESSENGER_DISPATCH", "JobOrder", jobOrderId, { stage, status: "Copied" });
}
