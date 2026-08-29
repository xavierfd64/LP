"use client";

import { flushSync } from "react-dom";
import { useState } from "react";

/**
 * Shared wrapper around the native "POST /api/logout" form every Sign Out
 * button in the app uses (header LogoutButton, customer/production mobile
 * "More" sheets) — see LogoutButton and app/api/logout/route.ts for why
 * this stays a real, unintercepted form submission rather than a Server
 * Action or a fetch()-based signOut(): the browser's own atomic "POST,
 * redirect + Set-Cookie in one response" sequence is what avoids the
 * session-resurrection race a prefetch could otherwise win.
 *
 * That correctness property means the click itself can't be intercepted
 * with preventDefault()+fetch() to show a pending state the usual way.
 * Instead, onSubmit synchronously flips local state via flushSync — this
 * commits and paints the "Signing out…" UI in the same tick, before the
 * browser moves on to actually submitting the (still fully native,
 * never-prevented) form — so the button gives immediate feedback even
 * when the round trip to clear the session takes a moment.
 */
export function LogoutForm({
  className,
  children,
}: {
  className?: string;
  children: (pending: boolean) => React.ReactNode;
}) {
  const [pending, setPending] = useState(false);

  return (
    <form
      action="/api/logout"
      method="POST"
      className={className}
      onSubmit={() => {
        flushSync(() => setPending(true));
      }}
    >
      {children(pending)}
    </form>
  );
}
