/**
 * Corrects the sidebar/bottom-nav active-state bug (Aug 19 corrective
 * update, item 2): two nav items — "Orders"/"Invoices" and "Payments"/
 * "Statement of Account" — legitimately point at the same underlying page
 * (this app has no separate Invoice or Customer-SOA route) but are
 * distinguished by a `?view=` query parameter the page itself reads to
 * change its heading/framing. A plain `pathname.startsWith(href)` check
 * can never tell those two apart, since the pathname is identical — it's
 * the ACTIVE-STATE CALCULATION itself that was wrong, not just its
 * styling. This compares both the path (prefix-matched, so a detail page
 * like /quotations/[id] still highlights "Quotations" as before) and the
 * `view` query parameter (matched exactly — present and equal, or both
 * absent) so only the one nav item matching the page's actual current
 * view is ever active.
 */
export function isNavItemActive(pathname: string, currentView: string | null, href: string): boolean {
  const [hrefPath, hrefQuery] = href.split("?");
  const hrefView = new URLSearchParams(hrefQuery ?? "").get("view");
  if (hrefView !== currentView) return false;
  return pathname === hrefPath || pathname.startsWith(hrefPath + "/");
}
