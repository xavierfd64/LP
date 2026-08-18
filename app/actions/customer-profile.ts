"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { logAudit } from "@/lib/audit";
import { signIn } from "@/lib/auth";
import { OAUTH_CONNECT_INTENT_COOKIE } from "@/lib/oauth-connect-intent";

const profileSchema = z.object({
  name: z.string().min(2, "Name is required"),
  companyName: z.string().optional(),
  email: z.union([z.string().email("Enter a valid email"), z.literal("")]).optional(),
  contactNumber: z.string().optional(),
  address: z.string().optional(),
  facebookUrl: z.string().optional(),
});

/**
 * Self-service edit of the customer's own record — the Customer.email
 * field here is their contact/business email (used for quotations,
 * notifications), kept intentionally separate from User.email (their
 * login identity, which OAuth account-matching relies on) — this form
 * never touches the login email, avoiding any risk to that invariant.
 */
export async function updateOwnProfileAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["CUSTOMER"]);
  const customer = await getCurrentCustomer(user.id);

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    companyName: formData.get("companyName") || undefined,
    email: formData.get("email") || undefined,
    contactNumber: formData.get("contactNumber") || undefined,
    address: formData.get("address") || undefined,
    facebookUrl: formData.get("facebookUrl") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      name: parsed.data.name,
      companyName: parsed.data.companyName || null,
      email: parsed.data.email || null,
      contactNumber: parsed.data.contactNumber || null,
      address: parsed.data.address || null,
      facebookUrl: parsed.data.facebookUrl || null,
    },
  });
  await logAudit(user.id, "CUSTOMER_PROFILE_UPDATED", "Customer", customer.id, {});
  revalidatePath("/account/profile");
  return "Profile updated.";
}

const setPasswordSchema = z
  .object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] });

/** Lets an OAuth-only account (passwordHash null) add email/password as a second sign-in method — spec item 14, "customer later chooses to establish a normal password." Not a "change password" flow — refuses if a password already exists (use Forgot Password for that). */
export async function setPasswordAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["CUSTOMER"]);
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (dbUser.passwordHash) return "You already have a password set. Use Forgot Password to change it.";

  const parsed = setPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await logAudit(user.id, "PASSWORD_SET", "User", user.id, {});
  revalidatePath("/account/profile");
  return "Password set — you can now sign in with your email and password too.";
}

/**
 * "Connect Google/Facebook from your account" (spec item: existing
 * customer can connect a provider from an already-logged-in session).
 * Marks intent via a short-lived cookie before starting the normal OAuth
 * redirect — lib/auth.ts's signIn callback reads it and refuses to
 * proceed unless the provider's returned email matches this exact user,
 * so a mismatched account can never silently create a duplicate or swap
 * the session to someone else's.
 */
export async function initiateConnectAction(provider: "google" | "facebook") {
  const user = await requireRole(["CUSTOMER"]);
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_CONNECT_INTENT_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });
  await signIn(provider, { redirectTo: "/account/profile" });
}
