import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { logAudit } from "@/lib/audit";
import { resolveOAuthUser, type OAuthProvider } from "@/lib/oauth-resolve";
import { OAUTH_CONNECT_INTENT_COOKIE } from "@/lib/oauth-connect-intent";

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

      // "Connect Google/Facebook from your account" (My Profile) sets this
      // short-lived cookie right before starting the OAuth redirect. If
      // present, this attempt must only ever attach the provider to the
      // SAME already-logged-in customer — never silently create a new
      // account or switch the session to a different one. Checked (and
      // rejected, before any DB write) ahead of the normal resolve.
      let intentUserId: string | undefined;
      try {
        intentUserId = (await cookies()).get(OAUTH_CONNECT_INTENT_COOKIE)?.value;
      } catch {
        intentUserId = undefined; // best-effort — never let a cookie-read issue break sign-in
      }
      if (intentUserId) {
        try {
          (await cookies()).delete(OAUTH_CONNECT_INTENT_COOKIE);
        } catch {
          // best-effort
        }
        if (!user.email) {
          await logAudit(intentUserId, "SOCIAL_ACCOUNT_LINK_FAILED", "User", intentUserId, { provider, reason: "no_email" });
          return "/account/profile?error=NoEmailFromProvider";
        }
        const intentUser = await prisma.user.findUnique({ where: { id: intentUserId } });
        if (!intentUser || intentUser.email.toLowerCase() !== user.email.toLowerCase()) {
          await logAudit(intentUserId, "SOCIAL_ACCOUNT_LINK_MISMATCH", "User", intentUserId, { provider });
          return "/account/profile?error=EmailMismatch";
        }
        // Emails match — falls through to the normal resolve below, which
        // updates connectedAt on this same existing user (no new account).
      }

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
