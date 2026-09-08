"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/session";
import { requirePermission, can } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";
import { ALL_PERMISSIONS, Permission } from "@/lib/permissions";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { generateTemporaryPassword } from "@/lib/password-generator";
import { sendEmailEvent } from "@/lib/email";
import { getBusinessSettings } from "@/lib/business-settings";
import { linkOrCreateCustomerForUser } from "@/lib/customer-linking";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

const userSchema = z.object({
  name: z.string().min(2, "Name is required."),
  email: z.string().email("Enter a valid email address."),
  role: z.enum(["ADMIN", "STAFF", "PRODUCTION", "CUSTOMER"]),
  phone: z.string().optional(),
  active: z.coerce.boolean().default(true),
  sendEmail: z.coerce.boolean().default(true),
});

export type CreateUserResult = { ok: true; tempPassword: string | null; emailed: boolean } | { ok: false; error: string };

// Caps automated abuse via a compromised admin/staff session hammering
// account creation — generous enough that legitimately onboarding a batch
// of new staff/customers in one sitting is never affected.
const CREATE_USER_LIMIT = 30;
const CREATE_USER_WINDOW_MS = 60 * 60 * 1000;

/**
 * Replaces the old inline "New User" form's manual temp-password field
 * (Sept 8 — User Management/Password Reset/Login Security improvement):
 * the temporary password is always generated server-side
 * (generateTemporaryPassword, crypto-random, policy-compliant), never
 * typed in by the creator. The account is marked mustChangePassword so
 * requireUser() forces the real owner through /change-password on first
 * login — see that function's doc comment in lib/session.ts. CUSTOMER is
 * now a creatable role here too (mirrors the existing self-registration
 * path's own Customer-linking, via linkOrCreateCustomerForUser).
 */
export async function createUserAction(formData: FormData): Promise<CreateUserResult> {
  const actor = await requirePermission("USER_CREATE");

  if (isRateLimited("admin-create-user", actor.id, CREATE_USER_LIMIT, CREATE_USER_WINDOW_MS)) {
    return { ok: false, error: "Too many accounts created recently. Please try again later." };
  }

  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    phone: formData.get("phone") || undefined,
    active: formData.get("active") === "on" || formData.get("active") === "true",
    sendEmail: formData.get("sendEmail") === "on" || formData.get("sendEmail") === "true",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  // Only an actual Administrator may create another Admin account — a
  // Staff member granted USER_CREATE (a real, if unusual, grant) must
  // never be able to hand themselves or anyone else Admin-level access.
  if (data.role === "ADMIN" && actor.role !== "ADMIN") {
    return { ok: false, error: "Only an Administrator can create an Admin account." };
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) return { ok: false, error: "An account with that email already exists." };

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role,
      phone: data.phone || null,
      active: data.active,
      mustChangePassword: true,
    },
  });

  if (data.role === "CUSTOMER") {
    await linkOrCreateCustomerForUser(user.id, { name: data.name, email: data.email, phone: data.phone });
  }

  await logAudit(actor.id, "USER_CREATED", "User", user.id, { email: user.email, role: user.role });

  let emailed = false;
  if (data.sendEmail) {
    const settings = await getBusinessSettings();
    if (settings.emailEnabled) {
      await sendEmailEvent("USER_ACCOUNT_CREATED", user.email, { customer_name: user.name, temporary_password: tempPassword });
      emailed = true;
    }
  }

  revalidatePath("/admin/users");
  return { ok: true, tempPassword: emailed ? null : tempPassword, emailed };
}

/**
 * Everything that must hold true before a user account can be turned off,
 * shared by every entry point (the /admin/users toggle and the Staff &
 * Permissions "Delete Staff" confirmation) — the real security/data-
 * integrity boundary lives here, not in whichever button happens to be
 * visible. Only checked in the deactivating direction; reactivating never
 * needs any of this.
 */
async function assertSafeToDeactivate(target: { id: string; role: string; active: boolean }) {
  if (!target.active) return; // already inactive — reactivating is always safe

  if (target.role === "ADMIN") {
    const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
    if (activeAdmins <= 1) {
      throw new Error("This account cannot be deactivated because the system must retain at least one administrator.");
    }
  }

  const [openStageLogs, openRework] = await Promise.all([
    prisma.jobOrderStageLog.count({ where: { assignedToId: target.id, status: { not: "COMPLETED" } } }),
    prisma.reworkRecord.count({ where: { assignedToId: target.id, status: { not: "DONE" } } }),
  ]);
  const openCount = openStageLogs + openRework;
  if (openCount > 0) {
    throw new Error(
      `This staff member has ${openCount} active production/design assignment${openCount === 1 ? "" : "s"}. Reassign or complete ${openCount === 1 ? "it" : "them"} before deactivating this account.`
    );
  }
}

async function deactivateOrActivateCore(userId: string, adminId: string): Promise<{ ok: true; nowActive: boolean } | { ok: false; error: string }> {
  if (userId === adminId) return { ok: false, error: "You can't deactivate your own account." };

  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  try {
    await assertSafeToDeactivate(target);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unable to deactivate this account." };
  }

  const user = await prisma.user.update({ where: { id: userId }, data: { active: !target.active } });
  await logAudit(adminId, user.active ? "USER_ACTIVATED" : "USER_DEACTIVATED", "User", userId, { email: user.email });

  return { ok: true, nowActive: user.active };
}

export async function toggleUserActiveAction(userId: string) {
  const actor = await requirePermission("USER_ACTIVATE_DEACTIVATE");
  const result = await deactivateOrActivateCore(userId, actor.id);
  if (!result.ok) throw new Error(result.error);
  revalidatePath("/admin/users");
}

/**
 * Same core as toggleUserActiveAction above, but for the Staff &
 * Permissions "Delete Staff" confirmation dialog: returns an error string
 * instead of throwing (so the dialog can show it inline) and never
 * navigates away, so the surrounding page updates in place.
 */
export async function deactivateStaffAction(userId: string, _prevState: string | undefined): Promise<string | undefined> {
  const admin = await requireRole(["ADMIN"]);
  const result = await deactivateOrActivateCore(userId, admin.id);
  if (!result.ok) return result.error;
  revalidatePath("/admin/staff-permissions");
  revalidatePath(`/admin/staff-permissions/${userId}`);
  revalidatePath("/admin/users");
}

const updateStaffProfileSchema = z
  .object({
    name: z.string().min(2, "Name is required."),
    email: z.string().email("Enter a valid email address."),
    phone: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .refine((d) => !d.newPassword || validatePasswordPolicy(d.newPassword) === null, {
    message: "New password does not meet the requirements — see the password rules.",
    path: ["newPassword"],
  })
  .refine((d) => (d.newPassword || d.confirmPassword ? d.newPassword === d.confirmPassword : true), {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

/**
 * Edits an existing STAFF account's identity fields — never role or
 * permissions (those stay exactly as configured; see the Permissions form
 * on this same page for that). Non-redirecting so the Staff & Permissions
 * page can update in place without navigating away. Password is optional:
 * left blank, the existing hash (and the session(s) it backs) is
 * untouched; supplied, it's re-hashed with the same bcrypt mechanism every
 * other password in this app uses and every session predating the change
 * is invalidated (sessionVersion bump — same reasoning as a self-service
 * password reset: a password change is exactly the moment a stale/
 * compromised session should stop working).
 */
export async function updateStaffProfileAction(userId: string, _prevState: string | undefined, formData: FormData): Promise<string | undefined> {
  const admin = await requireRole(["ADMIN"]);

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return "Staff account not found.";
  if (target.role !== "STAFF") return "Only STAFF accounts can be edited here.";

  const parsed = updateStaffProfileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    newPassword: formData.get("newPassword") || undefined,
    confirmPassword: formData.get("confirmPassword") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const { name, email, phone, newPassword } = parsed.data;

  const emailOwner = await prisma.user.findUnique({ where: { email } });
  if (emailOwner && emailOwner.id !== userId) return "That email address already belongs to another account.";

  const changedFields = ["name", "email", "phone"];
  if (newPassword) changedFields.push("password");

  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      email,
      phone: phone || null,
      ...(newPassword
        ? { passwordHash: await bcrypt.hash(newPassword, 10), sessionVersion: { increment: 1 } }
        : {}),
    },
  });

  // Field names only — the letter/reason "password" is included, but its
  // value never is, matching every other password-touching audit entry in
  // this app.
  await logAudit(admin.id, "USER_UPDATED", "User", userId, { fields: changedFields });

  revalidatePath("/admin/staff-permissions");
  revalidatePath(`/admin/staff-permissions/${userId}`);
  revalidatePath("/admin/users");
}

/** Replaces a STAFF user's full permission set with exactly what was submitted (checkbox grid on /admin/staff-permissions/[userId]). */
export async function updateStaffPermissionsAction(userId: string, formData: FormData) {
  const admin = await requireRole(["ADMIN"]);

  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.role !== "STAFF") throw new Error("Only STAFF accounts have configurable permissions.");

  const submitted = formData.getAll("permissions") as string[];
  const valid = new Set<string>(ALL_PERMISSIONS);
  const permissions = submitted.filter((p): p is Permission => valid.has(p));

  await prisma.$transaction([
    prisma.staffPermission.deleteMany({ where: { userId } }),
    prisma.staffPermission.createMany({ data: permissions.map((permission) => ({ userId, permission })) }),
  ]);

  await logAudit(admin.id, "STAFF_PERMISSIONS_UPDATED", "User", userId, { permissions });

  redirect(`/admin/staff-permissions/${userId}`);
}

const updateUserSchema = z.object({
  name: z.string().min(2, "Name is required."),
  email: z.string().email("Enter a valid email address."),
  phone: z.string().optional(),
  active: z.coerce.boolean(),
  role: z.enum(["ADMIN", "STAFF", "PRODUCTION", "CUSTOMER"]).optional(),
});

/**
 * General "Edit User" action for the redesigned /admin/users page (Sept
 * 8) — works for every role (unlike updateStaffProfileAction above, which
 * stays STAFF-only for its own Staff & Permissions page and is
 * unaffected by this addition). Name/email/phone/status are editable by
 * anyone holding USER_EDIT; a submitted `role` change is only ever
 * applied when the acting user is an actual Administrator — silently
 * ignored otherwise, enforced here server-side regardless of what a
 * tampered request sends, so a Staff member can never grant themselves
 * or anyone else a higher role through this form (spec: "must not
 * elevate permissions beyond what their role is authorized to manage").
 */
export async function updateUserAction(userId: string, formData: FormData): Promise<string | undefined> {
  const actor = await requirePermission("USER_EDIT");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return "Account not found.";

  const parsed = updateUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    active: formData.get("active") === "on" || formData.get("active") === "true",
    role: formData.get("role") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;

  const emailOwner = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (emailOwner && emailOwner.id !== userId) return "That email address already belongs to another account.";

  const roleChangeRequested = data.role && data.role !== target.role;
  if (roleChangeRequested && actor.role !== "ADMIN") {
    return "Only an Administrator can change a user's role.";
  }
  if (target.active && !data.active && userId === actor.id) {
    return "You can't deactivate your own account.";
  }
  if (!data.active && target.active) {
    try {
      await assertSafeToDeactivate(target);
    } catch (e) {
      return e instanceof Error ? e.message : "Unable to deactivate this account.";
    }
  }

  const changedFields: string[] = [];
  if (data.name !== target.name) changedFields.push("name");
  if (data.email.toLowerCase() !== target.email) changedFields.push("email");
  if ((data.phone || null) !== target.phone) changedFields.push("phone");
  if (data.active !== target.active) changedFields.push("active");
  if (roleChangeRequested) changedFields.push("role");

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      active: data.active,
      ...(roleChangeRequested && actor.role === "ADMIN" ? { role: data.role } : {}),
    },
  });

  if (changedFields.length > 0) {
    await logAudit(actor.id, "USER_UPDATED", "User", userId, { fields: changedFields });
  }

  revalidatePath("/admin/users");
}

export type ResetPasswordResult = { ok: true; tempPassword: string | null; emailed: boolean } | { ok: false; error: string };

// Per-admin cap — resetting passwords is disruptive (kills the target's
// existing sessions), so this stays tighter than account creation.
const RESET_PASSWORD_LIMIT = 20;
const RESET_PASSWORD_WINDOW_MS = 60 * 60 * 1000;

/**
 * Admin/authorized-staff password reset (Sept 8) — generates a secure
 * temporary password (never typed by the admin, never logged), marks the
 * account mustChangePassword, and invalidates every existing session on
 * it (sessionVersion bump) since a reset is often prompted by a suspected
 * compromise — same reasoning as the self-service reset-password flow.
 * A Staff member holding USER_RESET_PASSWORD may reset a Customer,
 * Staff, or Production account, but never an Admin account's password —
 * only an actual Administrator can do that, the same escalation boundary
 * enforced elsewhere in this file.
 */
export async function resetUserPasswordAction(userId: string): Promise<ResetPasswordResult> {
  const actor = await requirePermission("USER_RESET_PASSWORD");

  if (isRateLimited("admin-reset-password", actor.id, RESET_PASSWORD_LIMIT, RESET_PASSWORD_WINDOW_MS)) {
    return { ok: false, error: "Too many password resets performed recently. Please try again later." };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Account not found." };
  if (target.role === "ADMIN" && actor.role !== "ADMIN") {
    return { ok: false, error: "Only an Administrator can reset another Administrator's password." };
  }

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  // An authorized admin/staff reset is strong-enough proof to lift any
  // failed-login lockout early too — the account must not remain
  // unnecessarily locked after this (spec: "the account must not remain
  // unnecessarily locked after an authorized administrative reset").
  const lockoutWasActive = target.lockoutStage !== 0 || target.lockedUntil !== null;
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: true,
      sessionVersion: { increment: 1 },
      failedLoginCount: 0,
      lockoutStage: 0,
      lockedUntil: null,
    },
  });

  const ip = await clientIp();
  await logAudit(actor.id, "USER_PASSWORD_RESET_BY_ADMIN", "User", userId, { targetEmail: target.email, ip, lockoutCleared: lockoutWasActive });

  let emailed = false;
  const settings = await getBusinessSettings();
  if (settings.emailEnabled) {
    await sendEmailEvent("ADMIN_PASSWORD_RESET", target.email, { customer_name: target.name, temporary_password: tempPassword });
    emailed = true;
  }

  revalidatePath("/admin/users");
  return { ok: true, tempPassword: emailed ? null : tempPassword, emailed };
}
