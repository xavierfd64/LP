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

export type RealtimeEvent = RealtimeMessageEvent | RealtimeNotificationEvent;

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
