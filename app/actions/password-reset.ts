"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmailEvent } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { createPasswordResetToken, checkPasswordResetToken } from "@/lib/password-reset";

const GENERIC_MESSAGE = "If an account exists for that email, we've sent a password reset link.";

const requestSchema = z.object({ email: z.string().email() });

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
