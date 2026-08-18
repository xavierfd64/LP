import { prisma } from "@/lib/prisma";
import { generateSecureToken } from "@/lib/order-tracking";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Creates a fresh 1-hour, single-use reset token for a User — role-agnostic (Admin/Staff/Customer all use the same "Forgot Password" flow). */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = generateSecureToken();
  await prisma.passwordResetToken.create({
    data: { userId, token, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });
  return token;
}

export type TokenCheckResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "not_found" | "used" | "expired" | "inactive" };

export async function checkPasswordResetToken(token: string): Promise<TokenCheckResult> {
  const row = await prisma.passwordResetToken.findUnique({ where: { token }, include: { user: true } });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (!row.user.active) return { ok: false, reason: "inactive" };
  return { ok: true, userId: row.userId, email: row.user.email };
}
