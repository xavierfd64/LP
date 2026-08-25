import { Button } from "@/components/ui/button";

/**
 * A plain native HTML form POST to a real Route Handler (/api/logout) —
 * deliberately NOT a React Server Action. Logout needs the browser's own
 * "POST, receive a redirect + Set-Cookie in one response, follow it"
 * sequence: that's a single real HTTP round trip with no gap between the
 * cookie-clearing response landing and the next navigation's request being
 * built. A Server Action (even one followed by an explicit hard
 * window.location navigation) leaves exactly that gap open on this exact
 * Next.js/next-auth combination — verified empirically: admin/staff
 * dashboards prefetch every sidebar link on load, and once in a while one
 * of those prefetches (still carrying the pre-logout cookie it was sent
 * with) lands a moment after the Server Action's fetch() promise resolves
 * but before its Set-Cookie was actually applied, silently re-establishing
 * the session Auth.js had just cleared. A native form submission has no
 * such gap because there's no intervening JS scheduling at all.
 */
export function LogoutButton() {
  return (
    <form action="/api/logout" method="POST">
      <Button type="submit" variant="outline" size="sm">
        Sign out
      </Button>
    </form>
  );
}
