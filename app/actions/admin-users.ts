"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { ALL_PERMISSIONS, Permission } from "@/lib/permissions";

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "STAFF", "PRODUCTION"]),
  phone: z.string().optional(),
});

export async function createUserAction(_prevState: string | undefined, formData: FormData) {
  const admin = await requireRole(["ADMIN"]);

  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return "An account with that email already exists.";

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role,
      phone: parsed.data.phone,
    },
  });

  await logAudit(admin.id, "USER_CREATED", "User", user.id, { email: user.email, role: user.role });

  redirect(`/admin/users`);
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
  const admin = await requireRole(["ADMIN"]);
  const result = await deactivateOrActivateCore(userId, admin.id);
  if (!result.ok) throw new Error(result.error);
  redirect(`/admin/users`);
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
  .refine((d) => !d.newPassword || d.newPassword.length >= 6, {
    message: "New password must be at least 6 characters.",
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
