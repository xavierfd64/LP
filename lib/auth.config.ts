import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Auth.js v5 only auto-trusts the incoming request's Host/X-Forwarded-*
  // headers (`trustHost`) when it finds an `AUTH_URL` env var, is running
  // on Vercel/Cloudflare Pages, or NODE_ENV !== "production" (see
  // @auth/core's setEnvDefaults). This app's env var is `NEXTAUTH_URL`
  // (the v4-style name docker-compose.yml/.env.example already use), which
  // that auto-detection does NOT check — and Render is none of the above —
  // so in production trustHost silently defaulted to false, while it
  // defaulted to true in local `next dev` (NODE_ENV !== "production"
  // there). That dev/prod split is exactly why logout could look correct
  // locally while sessions behaved inconsistently on the deployed site
  // (protocol/host — and therefore secure-cookie — detection differing
  // across Server Action / Route Handler / Middleware call sites without
  // this explicitly pinned). Render is the only ingress point in front of
  // this app, so trusting its forwarded headers here is standard and safe.
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = (user as { id: string }).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
