"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";

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
