import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Security audit note (pre-Railway-migration pass): this builds its own
// NextAuth instance from the plain authConfig rather than importing the
// hardened `auth` from lib/auth.ts, so the JWT it decodes here is NOT
// checked against User.sessionVersion — a logged-out (or password-reset)
// session's token still passes THIS gate until it naturally expires.
// Verified this is not actually exploitable: every protected route group
// has its own layout.tsx (app/(app)/layout.tsx, app/(print)/layout.tsx)
// that calls requireUser() — which DOES use lib/auth.ts's auth() and DOES
// enforce sessionVersion — on every request, so a stale token is always
// rejected one layer in, before any protected data renders (confirmed by
// replaying a pre-logout session cookie directly against a protected page).
// Proxy defaults to the Node.js runtime as of Next.js 16 (previously Edge,
// which is why this split existed), so importing lib/auth.ts's instance
// here instead is now technically possible — deliberately not done, since
// it would add lib/auth.ts's own DB round-trips (getBusinessSettings +
// the sessionVersion lookup) to every single navigation, duplicating a
// check the layout guard immediately downstream already makes, for no
// additional real-world protection.
const { auth } = NextAuth(authConfig);

// "/" is listed here even though it never actually renders for an
// unauthenticated visitor — app/page.tsx redirects to /login itself (3rd
// Update, item 1) or to the right dashboard once signed in — so this entry
// just lets that page's own auth() call run instead of the middleware
// redirecting first with no callbackUrl.
// "/track" (exact, no token) is the public, session-free "track by
// reference number" page the /login page's Track Order button links to —
// distinct from "/" (which redirects an authenticated visitor to their
// dashboard) so that button can never appear to auto-log a user back in.
const PUBLIC_PATHS = ["/", "/login", "/register", "/forgot-password", "/track"];
// Login-free public pages — token-authorized by the page itself (see
// app/(public)/), not by session. Prefix-matched since both take a dynamic
// [token] segment. /reset-password/[token] is the same shape (the reset
// token IS the authorization, like /track and /documents).
// Meta's webhook has no session either — it authenticates itself via the
// hub.verify_token handshake / X-Hub-Signature-256, checked inside the route.
const PUBLIC_PATH_PREFIXES = ["/track/", "/documents/", "/form/", "/reset-password/", "/api/messenger/"];

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

// api/logout is excluded from the matcher entirely (not just handled
// inside the callback as a "public path") — Auth.js's `auth()` wrapper
// itself refreshes/re-issues the session-token cookie as a side effect of
// decoding a request's existing session, independent of whatever
// NextResponse the wrapped callback below returns. Routing /api/logout
// through that same auth() wrapper meant every logout POST could get its
// session cookie refreshed by the wrapper on the way in, then cleared by
// the route handler on the way out — a real, empirically-confirmed race
// between those two Set-Cookie sources within the *same* response. Fully
// bypassing the wrapper for this one path removes the race outright: nothing
// but app/api/logout/route.ts's own explicit deletions can touch this
// response's cookies.
export const config = {
  // branding/loading is excluded alongside the other static asset paths —
  // the login loading screen's printer/icon assets (Aug 29 corrective
  // update) must render during the window before the session cookie
  // exists (the loading screen appears the instant the login form
  // submits, ahead of the auth response), so they can never sit behind
  // the auth() check the way the rest of the app correctly does.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|branding/loading|api/logout).*)"],
};
