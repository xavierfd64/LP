"use server";

import { prisma } from "@/lib/prisma";
import { confirmedPaymentTotal } from "@/lib/workflow";
import { messengerOptinLink } from "@/lib/messenger";
import {
  ORDER_TRACKING_INCLUDE,
  buildOrderTimeline,
  currentStageLabel,
  nextExpectedDate,
  type OrderTrackingSnapshot,
} from "@/lib/order-tracking";

export type PublicTrackingResult =
  | { ok: false; reason: "not_found" | "revoked" | "expired" }
  | { ok: true; data: PublicOrderTracking };

export type PublicOrderTracking = {
  customerName: string;
  orderNumber: string;
  orderDate: string;
  /** Set exactly once, the moment the order's status first becomes
   * COMPLETED (Order.completedAt) — null while still in progress. Powers
   * the public tracking page's "Completed" / "Total Duration" summary. */
  completedAt: string | null;
  orderStatus: string;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  outstandingBalance: number | null;
  expectedDate: string | null;
  currentStage: string | null;
  service: string | null;
  jobOrderNumber: string | null;
  quantity: number | null;
  timeline: { label: string; state: "done" | "current" | "upcoming"; date: string | null }[];
  /**
   * Real m.me opt-in deep link (see lib/messenger.ts) for "Follow via
   * Messenger" (LBC-style follow-up) — null whenever Messenger isn't
   * enabled/configured, so the button can be hidden cleanly rather than
   * offered and failing. Never the customer's raw internal id — this is
   * the only Messenger-related field this public response ever carries.
   */
  messengerFollowLink: string | null;
};

/**
 * No authentication — the token IS the authorization. Deliberately returns
 * only customer-safe fields (see buildPublicSnapshot): no internal staff
 * notes, costs/margins, other customers' data, or private messages ever
 * reach this response. Read-only: never mutates the order/job order, only
 * the link's own view counters.
 */
export async function getPublicOrderTrackingAction(token: string): Promise<PublicTrackingResult> {
  const link = await prisma.orderTrackingLink.findUnique({ where: { token } });
  if (!link) return { ok: false, reason: "not_found" };
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  const order = await prisma.order.findUnique({ where: { id: link.orderId }, include: ORDER_TRACKING_INCLUDE });
  if (!order) return { ok: false, reason: "not_found" };

  await prisma.orderTrackingLink.update({
    where: { id: link.id },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });

  return { ok: true, data: await buildPublicSnapshot(order) };
}

export async function buildPublicSnapshot(order: OrderTrackingSnapshot): Promise<PublicOrderTracking> {
  const total = Number(order.totalAmount);
  const amountPaid = await confirmedPaymentTotal(order.id);
  const outstanding = Math.max(total - amountPaid, 0);
  const paymentStatus = amountPaid <= 0 ? "UNPAID" : amountPaid >= total ? "PAID" : "PARTIALLY_PAID";
  const jo = order.jobOrders[0];
  const messengerFollowLink = await messengerOptinLink(order.customerId);
  return {
    customerName: order.customer.name,
    orderNumber: order.orderNumber,
    orderDate: order.createdAt.toISOString(),
    completedAt: order.completedAt ? order.completedAt.toISOString() : null,
    orderStatus: order.status,
    paymentStatus,
    outstandingBalance: order.status === "CANCELLED" ? null : outstanding,
    expectedDate: nextExpectedDate(order)?.toISOString() ?? null,
    currentStage: currentStageLabel(order),
    service: jo?.productType ?? null,
    jobOrderNumber: jo?.joNumber ?? null,
    quantity: jo?.quantity ?? null,
    timeline: buildOrderTimeline(order).map((s) => ({
      label: s.label,
      state: s.state,
      date: s.date ? s.date.toISOString() : null,
    })),
    messengerFollowLink,
  };
}
