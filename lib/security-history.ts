import { prisma } from "@/lib/prisma";

/**
 * Login/security history (Sept 8 — User Profile/Progressive Lockout/
 * Security History improvement) — deliberately reuses the existing
 * AuditLog table rather than introducing a second "SecurityEvent"/
 * "LoginHistory" model. Every event below is written with
 * entityType: "User", entityId: <the account affected>, exactly like the
 * existing USER_CREATED/USER_UPDATED/USER_PASSWORD_RESET_BY_ADMIN entries
 * already in that table — this list just narrows a query to the
 * security-relevant subset of actions for display. IP/device/browser/OS/
 * user-agent, when known for an event, live inside AuditLog.changes
 * (a Json column) rather than as new dedicated columns.
 */
export const SECURITY_EVENT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGIN_BLOCKED_LOCKOUT_ACTIVE",
  "ACCOUNT_LOCKED_30M",
  "ACCOUNT_LOCKED_1H",
  "ACCOUNT_LOCKED_5H",
  "ACCOUNT_BLOCKED_24H",
  "CAPTCHA_FAILED",
  "PASSWORD_CHANGE_SELF_SERVICE",
  "PASSWORD_CHANGE_FORCED_COMPLETED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "USER_PASSWORD_RESET_BY_ADMIN",
  "LOGOUT",
] as const;

export const SECURITY_EVENT_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: "Successful Login",
  LOGIN_FAILED: "Failed Login",
  LOGIN_BLOCKED_LOCKOUT_ACTIVE: "Login Attempt Blocked (Account Locked)",
  ACCOUNT_LOCKED_30M: "Account Locked — 30 Minutes",
  ACCOUNT_LOCKED_1H: "Account Locked — 1 Hour",
  ACCOUNT_LOCKED_5H: "Account Locked — 5 Hours",
  ACCOUNT_BLOCKED_24H: "Account Blocked — 24 Hours",
  CAPTCHA_FAILED: "CAPTCHA Verification Failed",
  PASSWORD_CHANGE_SELF_SERVICE: "Password Changed",
  PASSWORD_CHANGE_FORCED_COMPLETED: "Temporary Password Changed",
  PASSWORD_RESET_REQUESTED: "Password Reset Requested",
  PASSWORD_RESET_COMPLETED: "Password Reset Completed",
  USER_PASSWORD_RESET_BY_ADMIN: "Password Reset by Administrator",
  LOGOUT: "Logout",
};

const FAILURE_ACTIONS = new Set([
  "LOGIN_FAILED",
  "LOGIN_BLOCKED_LOCKOUT_ACTIVE",
  "ACCOUNT_LOCKED_30M",
  "ACCOUNT_LOCKED_1H",
  "ACCOUNT_LOCKED_5H",
  "ACCOUNT_BLOCKED_24H",
  "CAPTCHA_FAILED",
]);

export type SecurityHistoryEvent = {
  id: string;
  action: string;
  label: string;
  result: "Success" | "Failed";
  createdAt: Date;
  ip: string | null;
  device: string | null;
  actorId: string | null;
};

function readChanges(changes: unknown): { ip?: string; device?: string } {
  if (!changes || typeof changes !== "object") return {};
  const c = changes as Record<string, unknown>;
  return {
    ip: typeof c.ip === "string" ? c.ip : undefined,
    device: typeof c.device === "string" ? c.device : undefined,
  };
}

export async function getSecurityHistory(
  userId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ events: SecurityHistoryEvent[]; page: number; pageSize: number; total: number; totalPages: number }> {
  const pageSize = options?.pageSize ?? 20;
  const page = Math.max(1, options?.page ?? 1);

  const where = { entityType: "User", entityId: userId, action: { in: [...SECURITY_EVENT_ACTIONS] as string[] } };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const events: SecurityHistoryEvent[] = rows.map((row) => {
    const { ip, device } = readChanges(row.changes);
    return {
      id: row.id,
      action: row.action,
      label: SECURITY_EVENT_LABELS[row.action] ?? row.action,
      result: FAILURE_ACTIONS.has(row.action) ? "Failed" : "Success",
      createdAt: row.createdAt,
      ip: ip ?? null,
      device: device ?? null,
      actorId: row.actorId,
    };
  });

  return { events, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
