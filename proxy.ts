import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/register"];
// Login-free public pages — token-authorized by the page itself (see
// app/(public)/), not by session. Prefix-matched since both take a dynamic
// [token] segment.
const PUBLIC_PATH_PREFIXES = ["/track/", "/documents/"];

// Path prefix -> roles allowed. Missing entry = any authenticated role.
const ROLE_RULES: { prefix: string; roles: string[] }[] = [
  // More specific prefixes must come before the general "/admin" rule below
  // — ROLE_RULES.find() takes the first match. Reward configuration can be
  // delegated to STAFF via the granular permission system (REWARDS_MANAGE_CONFIG),
  // so it isn't locked behind the admin-only rule the way user/workflow-template
  // management is.
  { prefix: "/admin/rewards", roles: ["ADMIN", "STAFF"] },
  { prefix: "/admin", roles: ["ADMIN"] },
  // STAFF can be granted production permissions too (e.g. a "Production Staff"
  // preset); the PRODUCTION role itself keeps its existing unrestricted access.
  { prefix: "/production", roles: ["PRODUCTION", "ADMIN", "STAFF"] },
  { prefix: "/inventory", roles: ["STAFF", "ADMIN"] },
  { prefix: "/payments", roles: ["STAFF", "ADMIN", "CUSTOMER"] },
  { prefix: "/users", roles: ["ADMIN"] },
];

function homeFor(role: string) {
  switch (role) {
    case "ADMIN":
      return "/admin/dashboard";
    case "STAFF":
      return "/dashboard";
    case "PRODUCTION":
      return "/production";
    case "CUSTOMER":
      return "/dashboard";
    default:
      return "/login";
  }
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/uploads")
  ) {
    return NextResponse.next();
  }

  const session = req.auth;
  if (!session?.user) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = session.user.role;
  const rule = ROLE_RULES.find((r) => pathname.startsWith(r.prefix));
  if (rule && !rule.roles.includes(role)) {
    return NextResponse.redirect(new URL(homeFor(role), req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};
