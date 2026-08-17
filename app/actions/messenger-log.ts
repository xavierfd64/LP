"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { getBusinessSettings } from "@/lib/business-settings";
import { decryptSecret } from "@/lib/email-crypto";
import { logAudit } from "@/lib/audit";

/** Manual retry for a FAILED MessengerLog row — mirrors retryEmailAction: one attempt per click, left to Staff/Admin judgment, never automatic/unbounded. */
export async function retryMessengerAction(logId: string) {
  const user = await requirePermission("EMAIL_LOG_VIEW");
  const log = await prisma.messengerLog.findUniqueOrThrow({ where: { id: logId }, include: { customer: true } });
  if (log.status !== "FAILED") return;

  const settings = await getBusinessSettings();
  const connection = await prisma.messengerConnection.findUnique({ where: { customerId: log.customerId } });

  if (!settings.messengerPageAccessTokenEnc || !connection?.connected || !connection.psid) {
    await logAudit(user.id, "MESSENGER_RETRY_FAILED", "MessengerLog", logId, {});
    revalidatePath("/admin/messenger-log");
    return;
  }

  await prisma.messengerLog.update({ where: { id: logId }, data: { status: "SENDING" } });
  try {
    const pageAccessToken = decryptSecret(settings.messengerPageAccessTokenEnc);
    const res = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: connection.psid },
        message: { text: log.message },
        messaging_type: "MESSAGE_TAG",
        tag: "POST_PURCHASE_UPDATE",
      }),
    });
    if (!res.ok) throw new Error(`Meta Send API error ${res.status}`);
    await prisma.messengerLog.update({ where: { id: logId }, data: { status: "SENT", sentAt: new Date() } });
    await logAudit(user.id, "MESSENGER_RETRY_SUCCEEDED", "MessengerLog", logId, {});
  } catch (e) {
    await prisma.messengerLog.update({
      where: { id: logId },
      data: { status: "FAILED", failureReason: e instanceof Error ? e.message : "Unknown error." },
    });
    await logAudit(user.id, "MESSENGER_RETRY_FAILED", "MessengerLog", logId, {});
  }
  revalidatePath("/admin/messenger-log");
}
