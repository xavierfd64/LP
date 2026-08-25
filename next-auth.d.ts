import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "STAFF" | "PRODUCTION" | "CUSTOMER";
    } & DefaultSession["user"];
  }

  interface User {
    role: "ADMIN" | "STAFF" | "PRODUCTION" | "CUSTOMER";
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "STAFF" | "PRODUCTION" | "CUSTOMER";
    // Compared against User.sessionVersion on every request (lib/auth.ts's
    // jwt callback) — see that field's own doc comment in schema.prisma for
    // why this exists: it's what makes logout unconditionally effective.
    sessionVersion: number;
  }
}
