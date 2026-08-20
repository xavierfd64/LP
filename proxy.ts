import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

// "/" is the public tracking landing page for anonymous visitors — it
// handles its own redirect to the right dashboard once signed in (see
// app/page.tsx), so it must not be gated here.
const PUBLIC_PATHS = ["/", "/login", "/register", "/forgot-password"];
// Login-free public pages — token-authorized by the page itself (see
// app/(public)/), not by session. Prefix-matched since both take a dynamic
// [token] segment. /reset-password/[token] is the same shape (the reset
// token IS the authorization, like /track and /documents).
// Meta's webhook has no session either — it authenticates itself via the
// hub.verify_token handshake / X-Hub-Signature-256, checked inside the route.
const PUBLIC_PATH_PREFIXES = ["/track/", "/documents/", "/reset-password/", "/api/messenger/"];

// Path prefix -> roles allowed. Missing entry = any authenticated role.
const ROLE_RULES: { prefix: string; roles: string[] }[] = [
  // Pre-existing bug found+fixed during the Aug 20 1st update: this used to
  // read `roles: ["ADMIN"]`, which silently blocked STAFF from every
  // /admin/* page at the middleware layer — including /admin/services,
  // /admin/promotions, /admin/email-log, /admin/messenger-log, and the new
  // /admin/expenses + /admin/expense-categories — even for a Staff account
  // granted the exact permission that page's own page-level check requires
  // (e.g. SERVICE_MANAGE, EXPENSE_VIEW). Only /admin/rewards had been
  // separately carved out, which is what made the bug easy to miss. Every
  // /admin/* page.tsx already does its own correct requireRole(["ADMIN"])
  // or can(user, "...") check (verified across all pages under app/(app)/admin/),
  // so admitting STAFF here is safe — this rule now only keeps out
  // CUSTOMER/PRODUCTION, and each page enforces the real, finer-grained rule.
  { prefix: "/admin", roles: ["ADMIN", "STAFF"] },
  // STAFF can be granted production permissions too (e.g. a "Production Staff"
  // preset); the PRODUCTION role itself keeps its existing unrestricted access.
  { prefix: "/production", roles: ["PRODUCTION", "ADMIN", "STAFF"] },
  // Pre-existing bug found+fixed during the Aug 20 3rd update: PRODUCTION
  // was missing from this list even though /inventory/page.tsx,
  // /inventory/[itemId]/page.tsx, and recordMovementAction all explicitly
  // grant PRODUCTION access — meaning Production has been silently unable
  // to reach Inventory at all since this rule's introduction (predates
  // every update this session, see commit c61bac2). The new Supplier
  // pages under /inventory/suppliers/* still correctly exclude PRODUCTION
  // at the page level (their own isStaffLike check), so widening this
  // prefix rule doesn't expose anything new to Production.
  { prefix: "/inventory", roles: ["STAFF", "ADMIN", "PRODUCTION"] },
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
