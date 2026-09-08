"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { roleHomePath } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

const CONFIRM_IP_LIMIT = 20;
const CONFIRM_IP_WINDOW_MS = 60 * 60 * 1000;

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((d, ctx) => {
    const policyError = validatePasswordPolicy(d.newPassword);
    if (policyError) ctx.addIssue({ code: "custom", path: ["newPassword"], message: policyError });
    if (d.newPassword !== d.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
    }
    if (d.currentPassword === d.newPassword) {
      ctx.addIssue({ code: "custom", path: ["newPassword"], message: "New password must be different from your current/temporary password." });
    }
  });

/**
 * Backs the forced "Change Your Password" screen (Sept 8 — User
 * Management/Password Reset/Login Security improvement) — reached
 * whenever requireUser() (lib/session.ts) finds mustChangePassword set,
 * which happens after an admin/staff creates an account or force-resets
 * one (app/actions/admin-users.ts). Also usable for a voluntary password
 * change outside that state (mustChangePassword already false — this
 * action doesn't require it to be true, only that currentPassword is
 * correct), though nothing in the nav links here for that case yet.
 *
 * Bumps sessionVersion exactly like the self-service reset-password flow
 * (app/actions/password-reset.ts) — a temporary password having worked at
 * all means it may have been seen by more than the intended person, so
 * every session it could have started (this one included) is invalidated
 * — then immediately re-signs-in with the new password so THIS browser's
 * session keeps working (matching resetPasswordAction's exact pattern).
 */
export async function forceChangePasswordAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireUser({ allowMustChangePassword: true });

  const ip = await clientIp();
  if (isRateLimited("change-password-confirm-ip", ip, CONFIRM_IP_LIMIT, CONFIRM_IP_WINDOW_MS)) {
    return "Too many attempts. Please try again later.";
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!dbUser.passwordHash || !(await bcrypt.compare(parsed.data.currentPassword, dbUser.passwordHash))) {
    return "Current password is incorrect.";
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
  });
  await logAudit(user.id, "PASSWORD_CHANGE_FORCED_COMPLETED", "User", user.id, {});

  try {
    await signIn("credentials", { email: dbUser.email, password: parsed.data.newPassword, redirectTo: roleHomePath(dbUser.role) });
  } catch (error) {
    if (error instanceof AuthError) return "Password updated — please log in.";
    throw error;
  }
}
