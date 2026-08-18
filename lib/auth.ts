import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { linkOrCreateCustomerForUser } from "@/lib/customer-linking";
import { logAudit } from "@/lib/audit";

type OAuthProvider = "google" | "facebook";
type ResolveResult =
  | { ok: true; userId: string; created: boolean }
  | { ok: false; reason: "no_email" | "unverified_email" | "inactive" | "non_customer" };

/**
 * Finds-or-creates the internal User for a verified OAuth identity, and
 * rejects the sign-in outright rather than silently no-op'ing when it isn't
 * safe to proceed. Never stores the provider's password (there isn't one)
 * — passwordHash stays null, so an OAuth-only account can only ever sign in
 * through that provider (the Credentials authorize() below explicitly
 * rejects null-hash accounts).
 *
 * Security rules enforced here (all called out explicitly in the 6th
 * update spec):
 * - The provider must supply an email, and Google's `email_verified` claim
 *   must not be explicitly false — an unverified email is never trusted
 *   enough to link to an existing account (item 10). Facebook's Graph API
 *   only ever returns an email for confirmed accounts, so there is no
 *   separate flag to check there.
 * - Social sign-in only ever resolves to a CUSTOMER account. If the
 *   matched email belongs to an Admin/Staff/Production user, the sign-in
 *   is rejected — administrative accounts must stay on password auth
 *   (items 19/20), even though the email happens to match.
 *
 * Email is the join key: an existing CUSTOMER User with this email is
 * reused as-is (so a customer who already registered normally, or
 * connected the other OAuth provider, or was created login-free by
 * Staff/Admin, doesn't get a second account) — otherwise a new CUSTOMER
 * User is created and handed to linkOrCreateCustomerForUser, which
 * attaches it to any pre-existing login-free Customer record with the same
 * email rather than duplicating it, preserving that Customer's whole
 * transaction history.
 */
async function resolveOAuthUser(
  provider: OAuthProvider,
  email: string | null | undefined,
  name: string,
  image: string | null | undefined,
  emailVerified: boolean | undefined
): Promise<ResolveResult> {
  if (!email) return { ok: false, reason: "no_email" };
  if (provider === "google" && emailVerified === false) return { ok: false, reason: "unverified_email" };

  const normalizedEmail = email.toLowerCase();
  const connectedAtField = provider === "google" ? "googleConnectedAt" : "facebookConnectedAt";

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    if (!existing.active) return { ok: false, reason: "inactive" };
    if (existing.role !== "CUSTOMER") return { ok: false, reason: "non_customer" };
    await prisma.user.update({ where: { id: existing.id }, data: { [connectedAtField]: new Date() } });
    return { ok: true, userId: existing.id, created: false };
  }

  const user = await prisma.user.create({
    data: {
      name: name || normalizedEmail,
      email: normalizedEmail,
      passwordHash: null,
      role: "CUSTOMER",
      [connectedAtField]: new Date(),
    },
  });
  const customer = await linkOrCreateCustomerForUser(user.id, { name: name || normalizedEmail, email: normalizedEmail });
  if (image && !customer.profileImageUrl) {
    await prisma.customer.update({ where: { id: customer.id }, data: { profileImageUrl: image } });
  }
  return { ok: true, userId: user.id, created: true };
}

// Google/Facebook are only registered as providers when real credentials are
// configured — the login page hides their buttons when unavailable (see
// lib/oauth-providers.ts), and normal email/password sign-in and
// registration are completely unaffected either way (spec: "must remain
// unchanged/available alongside the OAuth buttons").
const oauthProviders = [
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
    : []),
  ...(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
    ? [Facebook({ clientId: process.env.FACEBOOK_CLIENT_ID, clientSecret: process.env.FACEBOOK_CLIENT_SECRET })]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        if (!user.active) return null;
        if (!user.passwordHash) return null; // OAuth-only account — no password to check against

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
    ...oauthProviders,
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Does the full create-or-link + reject decision, since it's the only
    // callback with access to `profile` (needed for Google's
    // email_verified claim) and the one whose return value NextAuth
    // actually honors to redirect to a specific error — a string return
    // sends the browser straight there instead of the generic default
    // error page. Every outcome (success, and each rejection reason) is
    // audit-logged here (spec item 34) — never the raw OAuth token/profile.
    async signIn({ user, account, profile }) {
      if (!account || account.provider === "credentials") return true;

      const provider = account.provider as OAuthProvider;
      const emailVerified = provider === "google" ? (profile as { email_verified?: boolean } | undefined)?.email_verified : undefined;
      const result = await resolveOAuthUser(provider, user.email, user.name ?? "", user.image, emailVerified);

      if (!result.ok) {
        await logAudit(null, "SOCIAL_LOGIN_FAILED", "User", user.email ?? "unknown", { provider, reason: result.reason });
        if (result.reason === "non_customer") return "/login?error=AccountRestricted";
        if (result.reason === "unverified_email") return "/login?error=EmailNotVerified";
        if (result.reason === "inactive") return "/login?error=OAuthAccountInactive";
        return "/login?error=AccessDenied";
      }

      await logAudit(
        result.userId,
        result.created ? "SOCIAL_ACCOUNT_CREATED" : "SOCIAL_LOGIN_SUCCESS",
        "User",
        result.userId,
        { provider }
      );
      return true;
    },
    async jwt({ token, user, account }) {
      if (account && account.provider !== "credentials") {
        // signIn already validated/created the User (or this callback
        // wouldn't run) — just re-fetch by email for the token's id/role,
        // rather than re-running the create-or-link logic a second time.
        const dbUser = user.email ? await prisma.user.findUnique({ where: { email: user.email.toLowerCase() } }) : null;
        if (!dbUser) return token;
        token.id = dbUser.id;
        token.role = dbUser.role;
        return token;
      }
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = (user as { id: string }).id;
      }
      return token;
    },
  },
});
