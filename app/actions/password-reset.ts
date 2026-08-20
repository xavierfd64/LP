"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmailEvent } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { createPasswordResetToken, checkPasswordResetToken } from "@/lib/password-reset";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

const GENERIC_MESSAGE = "If an account exists for that email, we've sent a password reset link.";

const requestSchema = z.object({ email: z.string().email() });

// IP-keyed: caps mass reset-email spam from one source.
const RESET_REQUEST_IP_LIMIT = 5;
const RESET_REQUEST_IP_WINDOW_MS = 60 * 60 * 1000;
// Email-keyed: caps how many reset emails a single target address can be
// made to receive regardless of source IP (an attacker spreading requests
// across many IPs to spam one inbox). Generous enough that a legitimate
// user who fat-fingers their email or doesn't see the first message and
// retries a couple of times is never affected — and this only throttles
// *sending another email*, never the account's ability to log in, so it
// cannot become an account-lockout vector.
const RESET_REQUEST_EMAIL_LIMIT = 3;
const RESET_REQUEST_EMAIL_WINDOW_MS = 60 * 60 * 1000;

// IP-keyed only — the token itself is a 192-bit CSPRNG value, so brute
// forcing it is already computationally infeasible; this just adds a cheap
// defense-in-depth cap against automated submission traffic / unnecessary
// bcrypt-hashing cost, without risking a legitimate user (who might retry a
// failed confirm a few times) being locked out.
const RESET_CONFIRM_IP_LIMIT = 20;
const RESET_CONFIRM_IP_WINDOW_MS = 60 * 60 * 1000;

/**
 * Deliberately returns the exact same message whether or not the email
 * matches an account — an attacker (or anyone) probing this form can't
 * use it to discover which emails are registered. Also doubles as "set
 * your first password" for an OAuth-only account (passwordHash null) —
 * the reset link just lets them set one for the first time (spec item 14).
 */
export async function requestPasswordResetAction(_prevState: string | undefined, formData: FormData) {
  const parsed = requestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return "Enter a valid email address.";

  const ip = await clientIp();
  const ipLimited = isRateLimited("reset-request-ip", ip, RESET_REQUEST_IP_LIMIT, RESET_REQUEST_IP_WINDOW_MS);
  const emailLimited = isRateLimited(
    "reset-request-email",
    parsed.data.email.toLowerCase(),
    RESET_REQUEST_EMAIL_LIMIT,
    RESET_REQUEST_EMAIL_WINDOW_MS
  );
  // Both checks still run (never short-circuited) even once one is already
  // tripped, so the attempt count stays accurate — but the response is the
  // same generic message either way, revealing nothing about which limit
  // (or whether the account itself) triggered it.
  if (ipLimited || emailLimited) return GENERIC_MESSAGE;

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (user && user.active) {
    const token = await createPasswordResetToken(user.id);
    const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
    await sendEmailEvent("PASSWORD_RESET", user.email, {
      customer_name: user.name,
      reset_link: `${base}/reset-password/${token}`,
    });
    await logAudit(user.id, "PASSWORD_RESET_REQUESTED", "User", user.id, {});
  }
  return GENERIC_MESSAGE;
}

const resetSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] });

export async function resetPasswordAction(_prevState: string | undefined, formData: FormData) {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const ip = await clientIp();
  if (isRateLimited("reset-confirm-ip", ip, RESET_CONFIRM_IP_LIMIT, RESET_CONFIRM_IP_WINDOW_MS)) {
    return "This reset link is invalid or has expired. Please request a new one.";
  }

  const check = await checkPasswordResetToken(parsed.data.token);
  if (!check.ok) return "This reset link is invalid or has expired. Please request a new one.";

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({ where: { id: check.userId }, data: { passwordHash } });
  // Marks this token AND any other still-outstanding one for this user used
  // — a stale second link from an earlier request can't be replayed later.
  await prisma.passwordResetToken.updateMany({
    where: { userId: check.userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  await logAudit(check.userId, "PASSWORD_RESET_COMPLETED", "User", check.userId, {});

  try {
    await signIn("credentials", { email: check.email, password: parsed.data.password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) return "Password updated — please log in.";
    throw error;
  }
}
