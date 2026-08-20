"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { linkOrCreateCustomerForUser } from "@/lib/customer-linking";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

// IP-keyed: the primary brake on a single credential-stuffing source —
// generous enough that a normal user mistyping their password a few times,
// or a shared office/NAT IP with several real users, never trips it.
const LOGIN_IP_LIMIT = 20;
const LOGIN_IP_WINDOW_MS = 15 * 60 * 1000;
// Email-keyed: deliberately much looser than the IP limit, and never the
// sole gate on whether an account can sign in — its only job is capping
// genuinely abnormal volume spread across many IPs. A tight per-account
// limit here would let an attacker lock a real user out of their own
// account just by submitting a handful of wrong passwords for their email
// from anywhere; this threshold is high enough that never happens.
const LOGIN_EMAIL_LIMIT = 30;
const LOGIN_EMAIL_WINDOW_MS = 15 * 60 * 1000;

export async function loginAction(_prevState: string | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirectPath(formData.get("callbackUrl") as string | null) ?? "/";

  const ip = await clientIp();
  const ipLimited = isRateLimited("login-ip", ip, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS);
  const emailLimited = email ? isRateLimited("login-email", email.toLowerCase(), LOGIN_EMAIL_LIMIT, LOGIN_EMAIL_WINDOW_MS) : false;
  if (ipLimited || emailLimited) {
    // Same generic message as a wrong password — rate-limit state is never
    // exposed to the client, and this can't be used to probe whether an
    // email is registered.
    return "Invalid email or password.";
  }

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

// IP-keyed only — registration has no existing account to key by, and
// keying on the submitted email would let an attacker "reserve" a lockout
// against a target's email by repeatedly submitting it, blocking that
// person from ever registering. This just caps automated mass-account
// creation from one source.
const REGISTER_IP_LIMIT = 10;
const REGISTER_IP_WINDOW_MS = 60 * 60 * 1000;

export async function registerAction(_prevState: string | undefined, formData: FormData) {
  const ip = await clientIp();
  if (isRateLimited("register-ip", ip, REGISTER_IP_LIMIT, REGISTER_IP_WINDOW_MS)) {
    return "Too many signup attempts. Please try again later.";
  }

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
