"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { linkOrCreateCustomerForUser } from "@/lib/customer-linking";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { isRateLimited, clientIp } from "@/lib/rate-limit";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { verifyCaptcha } from "@/lib/captcha";
import { logAudit } from "@/lib/audit";
import { parseDeviceInfo, formatDeviceLabel } from "@/lib/device-info";
import { isCurrentlyLocked, lockoutMessage } from "@/lib/login-lockout";

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

  // Rate limit checked first (before CAPTCHA) so a captcha-guessing script
  // is bounded by the exact same counters as a credential-guessing one —
  // both count as "an attempt" against this IP/email regardless of which
  // check ends up failing it.
  const ip = await clientIp();
  const ipLimited = isRateLimited("login-ip", ip, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS);
  const emailLimited = email ? isRateLimited("login-email", email.toLowerCase(), LOGIN_EMAIL_LIMIT, LOGIN_EMAIL_WINDOW_MS) : false;
  if (ipLimited || emailLimited) {
    // Same generic message as a wrong password — rate-limit state is never
    // exposed to the client, and this can't be used to probe whether an
    // email is registered.
    return "Invalid email or password.";
  }

  // CAPTCHA is verified server-side before the real credential check — a
  // missing/tampered/expired token or a wrong answer is rejected here
  // regardless of what the frontend does or doesn't render, so a direct
  // call to this action (bypassing the login page's own UI entirely)
  // can't skip it either.
  const captchaToken = String(formData.get("captchaToken") ?? "");
  const captchaAnswerRaw = formData.get("captchaAnswer");
  const captchaAnswer = captchaAnswerRaw === null || captchaAnswerRaw === "" ? NaN : Number(captchaAnswerRaw);
  if (!captchaToken || Number.isNaN(captchaAnswer) || !verifyCaptcha(captchaToken, captchaAnswer)) {
    // Logged for security-history visibility only — deliberately never
    // counted toward the progressive account-lockout escalation (see
    // lib/login-lockout.ts's doc comment): a wrong CAPTCHA answer proves
    // nothing about whether the password was even attempted, and if it
    // counted toward lockout, anyone who merely knows a victim's email
    // could lock that account out just by submitting bad CAPTCHA answers
    // — easier than guessing a password. Governed only by the IP/email
    // rate limits already checked above.
    const target = email ? await prisma.user.findUnique({ where: { email }, select: { id: true } }) : null;
    const device = parseDeviceInfo((await headers()).get("user-agent"));
    await logAudit(null, "CAPTCHA_FAILED", "User", target?.id ?? (email || "unknown"), { ip, device: formatDeviceLabel(device), userAgent: device.userAgent });
    return "Incorrect answer to the security check. Please try again.";
  }

  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin": {
          // authorize() (lib/auth.ts) already persisted any lockout-state
          // change caused by THIS attempt before rejecting it — re-read
          // it fresh here purely to compose the right user-facing
          // message; the actual enforcement already happened there
          // regardless of whether this re-read succeeds.
          const target = await prisma.user.findUnique({
            where: { email },
            select: { lockoutStage: true, lockedUntil: true },
          });
          if (target?.lockedUntil && isCurrentlyLocked({ failedLoginCount: 0, lockoutStage: target.lockoutStage, lockedUntil: target.lockedUntil })) {
            return lockoutMessage(target.lockoutStage, target.lockedUntil);
          }
          return "Invalid email or password.";
        }
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
    password: z.string(),
    confirmPassword: z.string(),
    companyName: z.string().optional(),
    phone: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const policyError = validatePasswordPolicy(data.password);
    if (policyError) ctx.addIssue({ code: "custom", path: ["password"], message: policyError });
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
    }
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

// Logout itself lives at app/api/logout/route.ts, a plain Route Handler —
// deliberately not a Server Action. Auth.js's own signOut() and a Server
// Action wrapping it were both tried first: with JWT sessions there's no
// server-side session to revoke, only cookies to clear, and the clearing
// computation itself was confirmed correct (read the cookie jar straight
// back after applying it) in both — but on this exact Next.js 16.3.0 /
// next-auth 5.0.0-beta.32 combination, neither reliably got the clearing
// Set-Cookie to the browser before the very next request (a hard
// navigation, or one of the sidebar-link prefetches every admin/staff
// dashboard fires on load) went out still carrying — and, since Auth.js
// re-issues a fresh session-token cookie on every authenticated request,
// re-establishing — the old session. A real Route Handler's native
// "POST, redirect + Set-Cookie in one response, browser follows it"
// sequence has no such gap. See that file and LogoutButton
// (components/layout/logout-button.tsx) for the full account.
