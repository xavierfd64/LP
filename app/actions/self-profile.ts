"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

const updateOwnProfileSchema = z.object({
  name: z.string().min(2, "Name is required."),
  phone: z.string().optional(),
});

/**
 * Self-service "My Profile" edit for STAFF/ADMIN/PRODUCTION accounts
 * (Sept 8 — User Profile/Progressive Lockout/Security History
 * improvement) — the CUSTOMER equivalent already exists as
 * updateOwnProfileAction in app/actions/customer-profile.ts.
 *
 * Deliberately only accepts name/phone: this schema has no `role` or
 * `permissions` field at all, so there is no code path here through
 * which a user could ever change their own role or access level,
 * regardless of what a tampered request sends — the only way to change
 * a role remains updateUserAction (app/actions/admin-users.ts), gated to
 * Administrators. Email is intentionally not editable here either (a
 * login identity change is handled through the existing Edit User flow
 * by someone holding USER_EDIT, not as a self-service action) — this
 * avoids building a second identity-change/uniqueness-race code path.
 */
export async function updateOwnStaffProfileAction(formData: FormData): Promise<string | undefined> {
  const user = await requireUser();
  if (user.role === "CUSTOMER") return "Use the Profile Information form instead.";

  const parsed = updateOwnProfileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const target = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const changedFields: string[] = [];
  if (parsed.data.name !== target.name) changedFields.push("name");
  if ((parsed.data.phone || null) !== target.phone) changedFields.push("phone");

  if (changedFields.length > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name, phone: parsed.data.phone || null },
    });
    await logAudit(user.id, "USER_SELF_PROFILE_UPDATED", "User", user.id, { fields: changedFields });
  }

  revalidatePath("/account/profile");
}
