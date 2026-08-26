import { EventEmitter } from "events";

/**
 * In-memory pub/sub for pushing live updates (new messages, new
 * notifications) to connected browser tabs over Server-Sent Events. This is
 * intentionally simple — a single Node EventEmitter, not a message queue —
 * which is correct as long as the app runs as a single server instance
 * (true for this deployment). If it's ever scaled to multiple instances,
 * this would need to move to a shared pub/sub (Redis, Postgres LISTEN/NOTIFY,
 * etc.) so events reach a user whose SSE connection landed on a different
 * instance than the one that published the event.
 */

export type RealtimeMessageEvent = {
  type: "message";
  conversationId: string;
  message: {
    id: string;
    body: string;
    senderId: string;
    senderName: string;
    senderRole: string;
    messageType: "TEXT" | "SYSTEM";
    createdAt: string;
    attachment: { path: string; name: string; mime: string; size: number } | null;
    reference:
      | { type: "INQUIRY"; id: string; label: string; status: string }
      | { type: "QUOTATION"; id: string; label: string; status: string; amount: string; customerName: string }
      | { type: "JOB_ORDER"; id: string; label: string; status: string }
      | null;
  };
};

export type RealtimeNotificationEvent = {
  type: "notification";
  notification: {
    id: string;
    type: string;
    message: string;
    link: string | null;
    read: boolean;
    createdAt: string;
  };
};

/**
 * A Production job order changed (stage move, return, start, add, reassign,
 * completion) — 3rd Update item 2/3. Deliberately carries no payload beyond
 * "something changed": every recipient already has its own board/dashboard
 * data loaded, so this is just the signal to refetch it (see
 * components/production/production-realtime-listener.tsx), not a diff to
 * apply — far simpler than keeping every client's local state in sync
 * field-by-field, and correct by construction since it always re-reads the
 * same server data every other view reads.
 */
export type RealtimeProductionEvent = { type: "production" };

export type RealtimeEvent = RealtimeMessageEvent | RealtimeNotificationEvent | RealtimeProductionEvent;

// Route Handlers and Server Actions compile into separate module graphs
// (visible even within a single Node process, especially under Turbopack
// dev), so a plain module-scope `new EventEmitter()` ends up as two
// independent instances that never see each other's events — the SSE route
// subscribes on one, sendMessageAction/notifyUser publish on the other.
// Stash it on `globalThis` (the same trick lib/prisma.ts uses for the
// PrismaClient singleton) so every module graph in this process shares it.
const globalForRealtime = globalThis as unknown as { realtimeBus?: EventEmitter };
const bus = globalForRealtime.realtimeBus ?? new EventEmitter();
bus.setMaxListeners(0);
globalForRealtime.realtimeBus = bus;

function channel(userId: string) {
  return `user:${userId}`;
}

export function subscribeUser(userId: string, listener: (event: RealtimeEvent) => void) {
  bus.on(channel(userId), listener);
  return () => {
    bus.off(channel(userId), listener);
  };
}

export function publishToUser(userId: string, event: RealtimeEvent) {
  bus.emit(channel(userId), event);
}

export function publishToUsers(userIds: string[], event: RealtimeEvent) {
  for (const id of userIds) publishToUser(id, event);
}
