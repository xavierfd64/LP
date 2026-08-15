"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";
import { saveUploadedFile } from "@/lib/upload";
import { notifyCustomer } from "@/lib/notifications";

async function maybeCompleteOrder(orderId: string) {
  const jobOrders = await prisma.jobOrder.findMany({ where: { orderId } });
  if (jobOrders.length > 0 && jobOrders.every((j) => j.status === "COMPLETED")) {
    const order = await prisma.order.update({ where: { id: orderId }, data: { status: "COMPLETED" } });
    await notifyCustomer(
      order.customerId,
      "ORDER_COMPLETED",
      `Your order ${order.orderNumber} is complete. Thank you!`,
      `/orders/${orderId}`
    );
    const { onOrderCompleted } = await import("@/lib/rewards");
    await onOrderCompleted(orderId);
  }
}

export async function createFulfillmentAction(jobOrderId: string, formData: FormData) {
  const method = formData.get("method") as "PICKUP" | "DELIVERY" | "INSTALLATION";
  const schedulePermission =
    method === "PICKUP"
      ? "FULFILLMENT_SCHEDULE_PICKUP"
      : method === "DELIVERY"
        ? "FULFILLMENT_SCHEDULE_DELIVERY"
        : "FULFILLMENT_MARK_INSTALLED";
  const user = await requirePermission(schedulePermission);
  const jo = await prisma.jobOrder.findUniqueOrThrow({
    where: { id: jobOrderId },
    include: { workflowTemplate: { include: { stages: true } }, order: true },
  });

  if (jo.status !== "RELEASED") {
    redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent("Job order must be RELEASED before fulfillment can be scheduled.")}`);
  }

  const scheduledDateRaw = formData.get("scheduledDate") as string | null;
  const trackingNumber = (formData.get("trackingNumber") as string) || undefined;
  const courier = (formData.get("courier") as string) || undefined;

  if (method === "INSTALLATION" && !jo.workflowTemplate.stages.some((s) => s.isInstallStage)) {
    redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent("This product's workflow has no installation stage.")}`);
  }

  const initialStatus = method === "DELIVERY" ? "BOOKED" : "SCHEDULED";

  const fulfillment = await prisma.fulfillment.create({
    data: {
      orderId: jo.orderId,
      jobOrderId: jo.id,
      method,
      status: initialStatus,
      scheduledDate: scheduledDateRaw ? new Date(scheduledDateRaw) : undefined,
      trackingNumber: method === "DELIVERY" ? trackingNumber : undefined,
      courier: method === "DELIVERY" ? courier : undefined,
    },
  });

  await prisma.order.updateMany({ where: { id: jo.orderId, status: { not: "COMPLETED" } }, data: { status: "FULFILLING" } });
  await logAudit(user.id, "FULFILLMENT_CREATED", "Fulfillment", fulfillment.id, { method, jobOrderId });
  await notifyCustomer(
    jo.order.customerId,
    "FULFILLMENT_CREATED",
    `Your order ${jo.joNumber} is now being fulfilled via ${method.toLowerCase()}.`,
    `/job-orders/${jobOrderId}`
  );

  redirect(`/job-orders/${jobOrderId}`);
}

export async function advanceDeliveryAction(fulfillmentId: string, jobOrderId: string) {
  const f = await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
  const next = f.status === "BOOKED" ? "IN_TRANSIT" : f.status === "IN_TRANSIT" ? "DELIVERED" : null;
  const user = await requirePermission(next === "DELIVERED" ? "FULFILLMENT_MARK_DELIVERED" : "FULFILLMENT_UPDATE_DELIVERY_STATUS");
  if (!next) redirect(`/job-orders/${jobOrderId}`);

  await prisma.fulfillment.update({
    where: { id: fulfillmentId },
    data: { status: next!, completedAt: next === "DELIVERED" ? new Date() : undefined },
  });
  await logAudit(user.id, "FULFILLMENT_STATUS_UPDATED", "Fulfillment", fulfillmentId, { status: next });

  if (next === "IN_TRANSIT") {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: f.orderId } });
    await notifyCustomer(
      order.customerId,
      "FULFILLMENT_IN_TRANSIT",
      `Your order is on its way${f.courier ? ` with ${f.courier}` : ""}${f.trackingNumber ? ` (tracking #${f.trackingNumber})` : ""}.`,
      `/orders/${order.id}`
    );
  }

  if (next === "DELIVERED") {
    const jo = await prisma.jobOrder.update({ where: { id: jobOrderId }, data: { status: "COMPLETED" } });
    await logAudit(user.id, "JOB_ORDER_COMPLETED", "JobOrder", jobOrderId, {});
    const order = await prisma.order.findUniqueOrThrow({ where: { id: f.orderId } });
    await notifyCustomer(order.customerId, "FULFILLMENT_DELIVERED", `Your order has been delivered.`, `/orders/${order.id}`);
    await notifyCustomer(
      order.customerId,
      "JOB_ORDER_COMPLETED",
      `Job order ${jo.joNumber} is complete.`,
      `/job-orders/${jobOrderId}`
    );
    await maybeCompleteOrder(f.orderId);
  }

  redirect(`/job-orders/${jobOrderId}`);
}

export async function uploadDeliveryProofAction(fulfillmentId: string, jobOrderId: string, formData: FormData) {
  const user = await requirePermission("FULFILLMENT_UPDATE_DELIVERY_STATUS");
  const file = formData.get("proofFile") as File | null;
  if (!file || file.size === 0) redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent("Choose a file first.")}`);

  const saved = await saveUploadedFile(file!);
  await prisma.fulfillment.update({ where: { id: fulfillmentId }, data: { proofFilePath: saved.path } });
  await logAudit(user.id, "DELIVERY_PROOF_UPLOADED", "Fulfillment", fulfillmentId, {});

  redirect(`/job-orders/${jobOrderId}`);
}

export async function markPickedUpAction(fulfillmentId: string, jobOrderId: string) {
  const user = await requirePermission("FULFILLMENT_SCHEDULE_PICKUP");
  const f = await prisma.fulfillment.update({
    where: { id: fulfillmentId },
    data: { status: "RECEIVED", completedAt: new Date() },
  });
  const jo = await prisma.jobOrder.update({ where: { id: jobOrderId }, data: { status: "COMPLETED" } });
  await logAudit(user.id, "FULFILLMENT_STATUS_UPDATED", "Fulfillment", fulfillmentId, { status: "RECEIVED" });
  await logAudit(user.id, "JOB_ORDER_COMPLETED", "JobOrder", jobOrderId, {});
  {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: f.orderId } });
    await notifyCustomer(order.customerId, "FULFILLMENT_RECEIVED", `Your pickup has been marked as received.`, `/orders/${order.id}`);
    await notifyCustomer(
      order.customerId,
      "JOB_ORDER_COMPLETED",
      `Job order ${jo.joNumber} is complete.`,
      `/job-orders/${jobOrderId}`
    );
  }
  await maybeCompleteOrder(f.orderId);

  redirect(`/job-orders/${jobOrderId}`);
}

export async function markInstalledAction(fulfillmentId: string, jobOrderId: string) {
  const user = await requirePermission("FULFILLMENT_MARK_INSTALLED");
  const f = await prisma.fulfillment.update({
    where: { id: fulfillmentId },
    data: { status: "INSTALLED", completedAt: new Date() },
  });
  const jo = await prisma.jobOrder.update({ where: { id: jobOrderId }, data: { status: "COMPLETED" } });
  await logAudit(user.id, "FULFILLMENT_STATUS_UPDATED", "Fulfillment", fulfillmentId, { status: "INSTALLED" });
  await logAudit(user.id, "JOB_ORDER_COMPLETED", "JobOrder", jobOrderId, {});
  {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: f.orderId } });
    await notifyCustomer(order.customerId, "FULFILLMENT_INSTALLED", `Your installation is complete.`, `/orders/${order.id}`);
    await notifyCustomer(
      order.customerId,
      "JOB_ORDER_COMPLETED",
      `Job order ${jo.joNumber} is complete.`,
      `/job-orders/${jobOrderId}`
    );
  }
  await maybeCompleteOrder(f.orderId);

  redirect(`/job-orders/${jobOrderId}`);
}
