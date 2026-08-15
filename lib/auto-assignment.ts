import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";
import { publishToUsers } from "@/lib/realtime";
import { presenceStatus } from "@/lib/staff-presence";

const FALLBACK_UNASSIGNED_MS = 15 * 60 * 1000;
const FALLBACK_SWEEP_MIN_INTERVAL_MS = 5 * 60 * 1000;

/** Eligible = active STAFF granted both COMMUNICATION_VIEW and COMMUNICATION_SEND (ADMIN is never auto-assigned — automatic assignment picks a front-line Staff member, matching the spec's "select available Staff"). Ranked online > away > offline, then by fewest currently-assigned CUSTOMER conversations, so load spreads out instead of always landing on the same person. */
async function pickEligibleStaff(): Promise<string | null> {
  const eligible = await prisma.user.findMany({
    where: {
      role: "STAFF",
      active: true,
      AND: [
        { staffPermissions: { some: { permission: "COMMUNICATION_VIEW" } } },
        { staffPermissions: { some: { permission: "COMMUNICATION_SEND" } } },
      ],
    },
    select: { id: true, lastActiveAt: true },
  });
  if (eligible.length === 0) return null;

  const loads = await prisma.conversation.groupBy({
    by: ["assignedStaffId"],
    where: { type: "CUSTOMER", assignedStaffId: { in: eligible.map((s) => s.id) } },
    _count: { _all: true },
  });
  const loadByStaff = new Map(loads.map((l) => [l.assignedStaffId as string, l._count._all]));
  const presenceRank = { online: 0, away: 1, offline: 2 } as const;

  const ranked = eligible
    .map((s) => ({ id: s.id, rank: presenceRank[presenceStatus(s.lastActiveAt)], load: loadByStaff.get(s.id) ?? 0 }))
    .sort((a, b) => a.rank - b.rank || a.load - b.load);

  return ranked[0]?.id ?? null;
}

async function assignAndNotify(conversationId: string, staffId: string, note: string) {
  await prisma.conversation.update({ where: { id: conversationId }, data: { assignedStaffId: staffId, assignedAt: new Date() } });
  const message = await prisma.message.create({
    data: { conversationId, senderId: staffId, type: "SYSTEM", body: note },
    include: { sender: true },
  });
  publishToUsers([staffId], {
    type: "message",
    conversationId,
    message: {
      id: message.id,
      body: message.body,
      senderId: message.senderId,
      senderName: message.sender.name,
      senderRole: message.sender.role,
      messageType: "SYSTEM",
      createdAt: message.createdAt.toISOString(),
    },
  });
  await notifyUser(staffId, "CONVERSATION_ASSIGNED", "A new customer conversation has been automatically assigned to you.", `/messages/${conversationId}`);
}

/** Called right after a customer's message lands in an unassigned CUSTOMER conversation, when Business Settings has assignment mode set to AUTOMATIC. No-op (leaves it unassigned for a Staff member to pick up manually, or for the fallback sweep) if no eligible Staff is currently found. */
export async function autoAssignOnNewCustomerMessage(conversationId: string) {
  const settings = await prisma.businessSettings.findUnique({ where: { id: "default" }, select: { assignmentMode: true } });
  if (settings?.assignmentMode !== "AUTOMATIC") return;

  const staffId = await pickEligibleStaff();
  if (!staffId) return;
  await assignAndNotify(conversationId, staffId, "Automatically assigned to an available Staff member.");
}

const globalForFallbackSweep = globalThis as unknown as { lastFallbackAssignmentSweepAt?: number };

/** For MANUAL_WITH_AUTO_FALLBACK: conversations still unassigned 15+ minutes after the customer's message get auto-assigned so nobody falls through the cracks. Debounced the same way as the 24h reminder sweep — no cron runner in this stack, so this rides along on SSE connections. */
export async function triggerFallbackAssignmentSweepIfDue() {
  const now = Date.now();
  if (
    globalForFallbackSweep.lastFallbackAssignmentSweepAt &&
    now - globalForFallbackSweep.lastFallbackAssignmentSweepAt < FALLBACK_SWEEP_MIN_INTERVAL_MS
  ) {
    return;
  }
  globalForFallbackSweep.lastFallbackAssignmentSweepAt = now;

  const settings = await prisma.businessSettings.findUnique({ where: { id: "default" }, select: { assignmentMode: true } });
  if (settings?.assignmentMode !== "MANUAL_WITH_AUTO_FALLBACK") return;

  const cutoff = new Date(now - FALLBACK_UNASSIGNED_MS);
  const stale = await prisma.conversation.findMany({
    where: { type: "CUSTOMER", assignedStaffId: null, lastCustomerMessageAt: { lte: cutoff } },
    select: { id: true },
  });
  for (const c of stale) {
    const staffId = await pickEligibleStaff();
    if (!staffId) break;
    await assignAndNotify(c.id, staffId, "Automatically assigned after going unclaimed for 15 minutes.");
  }
}
