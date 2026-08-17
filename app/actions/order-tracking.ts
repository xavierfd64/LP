"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { generateSecureToken } from "@/lib/order-tracking";
import { logAudit } from "@/lib/audit";

const expirySchema = z.object({
  expiresOption: z.enum(["none", "7", "30", "custom"]),
  customDate: z.string().optional(),
});

function resolveExpiresAt(input: z.infer<typeof expirySchema>): Date | null {
  if (input.expiresOption === "none") return null;
  if (input.expiresOption === "7") return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (input.expiresOption === "30") return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return input.customDate ? new Date(input.customDate) : null;
}

/** Generates a new tracking link for an Order. Does not revoke any existing link — Regenerate does that explicitly. */
export async function generateTrackingLinkAction(orderId: string, formData: FormData) {
  const user = await requirePermission("ORDER_TRACKING_MANAGE");

  const parsed = expirySchema.safeParse({
    expiresOption: formData.get("expiresOption"),
    customDate: formData.get("customDate") || undefined,
  });
  if (!parsed.success) return;

  const token = generateSecureToken();
  await prisma.orderTrackingLink.create({
    data: { token, orderId, createdById: user.id, expiresAt: resolveExpiresAt(parsed.data) },
  });

  await logAudit(user.id, "ORDER_TRACKING_LINK_GENERATED", "Order", orderId, {});
  revalidatePath(`/orders/${orderId}`);
}

export async function revokeTrackingLinkAction(linkId: string) {
  const user = await requirePermission("ORDER_TRACKING_MANAGE");
  const link = await prisma.orderTrackingLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
  await logAudit(user.id, "ORDER_TRACKING_LINK_REVOKED", "Order", link.orderId, {});
  revalidatePath(`/orders/${link.orderId}`);
}

/** Revokes any currently-active link for the order and immediately issues a fresh one — old shared URLs stop working right away. */
export async function regenerateTrackingLinkAction(orderId: string, formData: FormData) {
  const user = await requirePermission("ORDER_TRACKING_MANAGE");

  const parsed = expirySchema.safeParse({
    expiresOption: formData.get("expiresOption"),
    customDate: formData.get("customDate") || undefined,
  });
  if (!parsed.success) return;

  await prisma.orderTrackingLink.updateMany({
    where: { orderId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const token = generateSecureToken();
  await prisma.orderTrackingLink.create({
    data: { token, orderId, createdById: user.id, expiresAt: resolveExpiresAt(parsed.data) },
  });

  await logAudit(user.id, "ORDER_TRACKING_LINK_REGENERATED", "Order", orderId, {});
  revalidatePath(`/orders/${orderId}`);
}
