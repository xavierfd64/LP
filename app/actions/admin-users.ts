"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
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

export async function toggleUserActiveAction(userId: string) {
  const admin = await requireRole(["ADMIN"]);
  if (userId === admin.id) throw new Error("You can't deactivate your own account.");

  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const user = await prisma.user.update({ where: { id: userId }, data: { active: !target.active } });

  await logAudit(admin.id, user.active ? "USER_ACTIVATED" : "USER_DEACTIVATED", "User", userId, { email: user.email });

  redirect(`/admin/users`);
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
