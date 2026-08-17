"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { resolveEmailTransport } from "@/lib/email";
import { logAudit } from "@/lib/audit";

/**
 * Manual retry for a FAILED EmailLog row — resends the exact same
 * previously-rendered subject/body. Deliberately not automatic/unbounded
 * (spec: "Do not retry invalid addresses indefinitely") — each click is
 * one attempt, left entirely to Staff/Admin judgment (e.g. after fixing
 * the customer's email address via Edit Customer).
 */
export async function retryEmailAction(logId: string) {
  const user = await requirePermission("EMAIL_LOG_VIEW");
  const log = await prisma.emailLog.findUniqueOrThrow({ where: { id: logId } });
  if (log.status !== "FAILED") return;

  await prisma.emailLog.update({ where: { id: logId }, data: { status: "SENDING" } });
  try {
    const { transporter, fromAddress, fromName } = await resolveEmailTransport();
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: log.recipientEmail,
      subject: log.subject,
      html: log.bodyHtml.replace(/\n/g, "<br/>"),
      text: log.bodyHtml,
    });
    await prisma.emailLog.update({
      where: { id: logId },
      data: { status: "SENT", sentAt: new Date(), attemptCount: { increment: 1 } },
    });
    await logAudit(user.id, "EMAIL_RETRY_SUCCEEDED", "EmailLog", logId, {});
  } catch (e) {
    await prisma.emailLog.update({
      where: { id: logId },
      data: {
        status: "FAILED",
        failureReason: e instanceof Error ? e.message : "Unknown error.",
        attemptCount: { increment: 1 },
      },
    });
    await logAudit(user.id, "EMAIL_RETRY_FAILED", "EmailLog", logId, {});
  }
  revalidatePath("/admin/email-log");
}
