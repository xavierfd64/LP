/**
 * Presence is derived from User.lastActiveAt rather than pushed live — a
 * Staff/Admin client heartbeats every 30s (see heartbeatAction), and any
 * page that lists Staff (conversation list, assign/transfer/group pickers)
 * just re-reads lastActiveAt fresh each time it queries. That's "reasonable
 * real-time" per the spec without a dedicated presence broadcast channel.
 *
 * Pure/no imports so it's safe to use from Client Components.
 */
export type PresenceStatus = "online" | "away" | "offline";

const ONLINE_WITHIN_MS = 2 * 60 * 1000;
const AWAY_WITHIN_MS = 10 * 60 * 1000;

export function presenceStatus(lastActiveAt: Date | string | null | undefined): PresenceStatus {
  if (!lastActiveAt) return "offline";
  const ts = typeof lastActiveAt === "string" ? new Date(lastActiveAt).getTime() : lastActiveAt.getTime();
  const age = Date.now() - ts;
  if (age <= ONLINE_WITHIN_MS) return "online";
  if (age <= AWAY_WITHIN_MS) return "away";
  return "offline";
}

export const PRESENCE_DOT: Record<PresenceStatus, string> = {
  online: "🟢",
  away: "🟡",
  offline: "⚪",
};

export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  online: "Online",
  away: "Away",
  offline: "Offline",
};
