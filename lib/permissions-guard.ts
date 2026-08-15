import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { Permission, PERMISSION_LABELS } from "@/lib/permissions";

/** All granted permissions for a STAFF user, cached per request. Empty for non-STAFF roles. */
export const getStaffPermissions = cache(async (userId: string, role: string): Promise<Set<Permission>> => {
  if (role !== "STAFF") return new Set();
  const rows = await prisma.staffPermission.findMany({ where: { userId }, select: { permission: true } });
  return new Set(rows.map((r) => r.permission as Permission));
});

/** True if this user may perform `permission` — ADMIN always true, CUSTOMER/PRODUCTION always false (they don't use this system). */
export async function can(user: { id: string; role: string }, permission: Permission): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (user.role !== "STAFF") return false;
  const granted = await getStaffPermissions(user.id, user.role);
  return granted.has(permission);
}

/**
 * Server-action guard: ADMIN always passes. Roles listed in `bypassRoles`
 * pass unconditionally too (e.g. PRODUCTION for production/QC actions,
 * preserving their existing unrestricted access). Otherwise the caller must
 * be an active STAFF account with this specific permission granted. Throws
 * on denial — callers are mutations, so a thrown error is more appropriate
 * than a silent redirect.
 */
export async function requirePermission(permission: Permission, bypassRoles: string[] = []) {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  if (bypassRoles.includes(user.role)) return user;
  if (user.role !== "STAFF") throw new Error("Not allowed.");
  const granted = await can(user, permission);
  if (!granted) {
    throw new Error(`You do not have permission to do this (${PERMISSION_LABELS[permission] ?? permission}).`);
  }
  return user;
}
