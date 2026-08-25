import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// A genuine Route Handler, deliberately NOT a React Server Action — see
// LogoutButton. Logout is security-sensitive, so it needs the browser's
// own native "POST, get a redirect response with Set-Cookie in the same
// response, follow it" sequence: a real HTTP round trip has no gap between
// the cookie-clearing response landing and the next navigation's request
// being built, unlike a Server-Action fetch() followed by a separate
// window.location assignment from JS (empirically: still racy — the next
// navigation's request can be built from the cookie jar before the browser
// finishes applying the previous response's Set-Cookie, on this exact
// Next.js/next-auth combination).
//
// Clearing the cookie is still necessary (a clean browser with no leftover
// cookie), but per User.sessionVersion's doc comment it is not sufficient
// by itself: bumping sessionVersion here is what actually, unconditionally
// ends the session server-side — every token minted before this moment,
// including ones already in flight in a prefetch request that still
// carries the pre-logout cookie, fails the very next time lib/auth.ts's
// jwt callback checks it, regardless of what the browser's cookie jar does.
const AUTH_COOKIE_BASE_NAMES = [
  "authjs.session-token",
  "authjs.callback-url",
  "authjs.csrf-token",
  "authjs.pkce.code_verifier",
  "authjs.state",
  "authjs.nonce",
  "authjs.challenge",
];

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.id) {
    await prisma.user.update({ where: { id: session.user.id }, data: { sessionVersion: { increment: 1 } } });
  }

  const jar = await cookies();
  // Explicit path: "/" — see AUTH_COOKIE_BASE_NAMES' use in app/actions/auth.ts
  // for why this is required, not decorative.
  for (const name of AUTH_COOKIE_BASE_NAMES) {
    jar.delete({ name, path: "/" });
    jar.delete({ name: `__Secure-${name}`, path: "/" });
    jar.delete({ name: `__Host-${name}`, path: "/" });
  }
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
