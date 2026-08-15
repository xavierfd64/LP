import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";

const RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000;
const SWEEP_MIN_INTERVAL_MS = 10 * 60 * 1000;

/**
 * There's no job queue or cron runner in this stack, so the 24h no-response
 * reminder is driven two ways: (1) this debounced opportunistic trigger,
 * called from the SSE route on every new connection — cheap, and connections
 * happen often enough (page loads, tab reopens, reconnects) across Customer/
 * Staff/Admin traffic to approximate "runs periodically" without any new
 * infrastructure; (2) the dedicated GET /api/cron/response-reminders route,
 * for anyone who wants precise timing via a real external scheduler. Either
 * path calls the same runResponseReminderSweep().
 */
const globalForSweep = globalThis as unknown as { lastReminderSweepAt?: number };

export async function triggerResponseReminderSweepIfDue() {
  const now = Date.now();
  if (globalForSweep.lastReminderSweepAt && now - globalForSweep.lastReminderSweepAt < SWEEP_MIN_INTERVAL_MS) {
    return;
  }
  globalForSweep.lastReminderSweepAt = now;
  await runResponseReminderSweep();
}

/** Finds CUSTOMER conversations where the customer has been waiting 24h+ with no Staff/Admin reply, and no reminder has fired for the current 24h window yet. Notifies the responsible Staff (if assigned) and all Admins, with a link straight to the conversation. Returns how many reminders were sent. */
export async function runResponseReminderSweep(): Promise<number> {
  const cutoff = new Date(Date.now() - RESPONSE_WINDOW_MS);

  const due = await prisma.conversation.findMany({
    where: {
      type: "CUSTOMER",
      lastCustomerMessageAt: { lte: cutoff },
      OR: [{ lastReminderSentAt: null }, { lastReminderSentAt: { lte: cutoff } }],
    },
    include: { customer: true, assignedStaff: true },
  });

  let sent = 0;
  for (const c of due) {
    if (!c.customer) continue;
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    const recipientIds = new Set(admins.map((a) => a.id));
    if (c.assignedStaff) recipientIds.add(c.assignedStaff.id);

    const message = c.assignedStaff
      ? `${c.customer.name} has been waiting for a response for 24 hours. Responsible Staff: ${c.assignedStaff.name}.`
      : `${c.customer.name} has been waiting for a response for 24 hours and no Staff member is assigned yet.`;
    const link = `/messages/${c.id}`;

    await Promise.all(
      Array.from(recipientIds).map((userId) => notifyUser(userId, "CHAT_RESPONSE_REMINDER", message, link))
    );

    await prisma.conversation.update({ where: { id: c.id }, data: { lastReminderSentAt: new Date() } });
    sent += 1;
  }
  return sent;
}
