import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/register"];

// Path prefix -> roles allowed. Missing entry = any authenticated role.
const ROLE_RULES: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/production", roles: ["PRODUCTION", "ADMIN"] },
  { prefix: "/inventory", roles: ["STAFF", "ADMIN"] },
  { prefix: "/payments", roles: ["STAFF", "ADMIN"] },
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
