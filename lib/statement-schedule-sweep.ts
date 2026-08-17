import { prisma } from "@/lib/prisma";
import { createStatementAndNotify } from "@/lib/soa-generate";
import { resolveSoaPeriod, computeStatementOfAccount } from "@/lib/soa";

const SWEEP_MIN_INTERVAL_MS = 60 * 60 * 1000; // at most once/hour — the actual per-customer gate is lastRunAt vs. today

/**
 * Same "no job queue in this stack" pattern as lib/response-reminders.ts
 * and lib/auto-assignment.ts: a debounced opportunistic trigger off every
 * SSE connection, plus GET /api/cron/statement-schedules for a real
 * external scheduler. Recurring SOA delivery is entirely opt-in per
 * customer (StatementSchedule.enabled defaults false) — nothing here ever
 * fires unless Admin explicitly created and enabled a schedule.
 */
const globalForSweep = globalThis as unknown as { lastStatementScheduleSweepAt?: number };

export async function triggerStatementScheduleSweepIfDue() {
  const now = Date.now();
  if (globalForSweep.lastStatementScheduleSweepAt && now - globalForSweep.lastStatementScheduleSweepAt < SWEEP_MIN_INTERVAL_MS) {
    return;
  }
  globalForSweep.lastStatementScheduleSweepAt = now;
  await runStatementScheduleSweep();
}

/** Generates and emails (SOA_PAYMENT_REMINDER) the previous month's statement for every enabled schedule whose dayOfMonth has arrived and hasn't already run this month. Returns how many statements were sent. */
export async function runStatementScheduleSweep(): Promise<number> {
  const today = new Date();
  const schedules = await prisma.statementSchedule.findMany({
    where: { enabled: true },
    include: { customer: true },
  });

  let sent = 0;
  for (const schedule of schedules) {
    if (today.getDate() < schedule.dayOfMonth) continue;
    if (schedule.lastRunAt) {
      const last = schedule.lastRunAt;
      if (last.getFullYear() === today.getFullYear() && last.getMonth() === today.getMonth()) continue;
    }

    const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const range = resolveSoaPeriod({ type: "monthly", month: prevMonthDate.getMonth() + 1, year: prevMonthDate.getFullYear() });

    if (schedule.onlyIfOutstanding) {
      const asOfEnd = await computeStatementOfAccount(schedule.customerId, new Date(0), range.end);
      if (asOfEnd.outstandingBalance <= 0.01) {
        await prisma.statementSchedule.update({ where: { id: schedule.id }, data: { lastRunAt: today } });
        continue;
      }
    }

    await createStatementAndNotify(schedule.customerId, range, schedule.createdById, "SOA_PAYMENT_REMINDER");
    await prisma.statementSchedule.update({ where: { id: schedule.id }, data: { lastRunAt: today } });
    sent += 1;
  }

  return sent;
}
