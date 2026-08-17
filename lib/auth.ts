import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { linkOrCreateCustomerForUser } from "@/lib/customer-linking";

/**
 * Finds-or-creates the internal User for a verified OAuth identity. Never
 * stores the provider's password (there isn't one) — passwordHash stays
 * null, so this account can only ever sign in through that provider (the
 * Credentials authorize() below explicitly rejects null-hash accounts).
 *
 * Email is the join key: an existing User with this email is reused as-is
 * (so a customer who already registered normally, or connected the other
 * OAuth provider, doesn't get a second account); otherwise a new CUSTOMER
 * User is created and handed to linkOrCreateCustomerForUser, which attaches
 * it to any pre-existing login-free Customer record (created by Staff/Admin)
 * with the same email rather than duplicating it — preserving that
 * Customer's whole transaction history.
 */
async function resolveOAuthUser(email: string, name: string) {
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return existing.active ? existing : null;

  const user = await prisma.user.create({
    data: { name: name || normalizedEmail, email: normalizedEmail, passwordHash: null, role: "CUSTOMER" },
  });
  await linkOrCreateCustomerForUser(user.id, { name: name || normalizedEmail, email: normalizedEmail });
  return user;
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
    async signIn({ user, account }) {
      if (account && account.provider !== "credentials" && !user.email) return false; // Google/Facebook must supply a verified email
      return true;
    },
    async jwt({ token, user, account }) {
      if (account && account.provider !== "credentials") {
        const dbUser = user.email ? await resolveOAuthUser(user.email, user.name ?? "") : null;
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
