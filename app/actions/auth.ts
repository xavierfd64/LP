"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { linkOrCreateCustomerForUser } from "@/lib/customer-linking";
import { safeRedirectPath } from "@/lib/safe-redirect";

export async function loginAction(_prevState: string | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirectPath(formData.get("callbackUrl") as string | null) ?? "/";

  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid email or password.";
        default:
          return "Something went wrong. Please try again.";
      }
    }
    throw error;
  }
}

const registerSchema = z
  .object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
    companyName: z.string().optional(),
    phone: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function registerAction(_prevState: string | undefined, formData: FormData) {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    companyName: formData.get("companyName"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }
  const { name, email, password, companyName, phone } = parsed.data;
  const redirectTo = safeRedirectPath(formData.get("callbackUrl") as string | null) ?? "/";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return "An account with that email already exists.";

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: "CUSTOMER", phone },
  });
  await linkOrCreateCustomerForUser(user.id, { name, email, companyName, phone });

  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Account created — please log in.";
    }
    throw error;
  }
}

export async function oauthSignInAction(provider: "google" | "facebook", callbackUrl?: string | null) {
  const redirectTo = safeRedirectPath(callbackUrl) ?? "/";
  await signIn(provider, { redirectTo });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
