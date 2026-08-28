"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * System-wide instant-sync corrective update (Aug 28). Mounted once in the
 * authenticated Shell (components/layout/shell.tsx) alongside
 * RealtimeProvider, so it reaches every role — Admin, Staff, Production,
 * Customer — the same way RefreshOnMessage/ProductionRealtimeListener
 * already do for their own narrower event types.
 *
 * notifyUser/notifyStaff/notifyCustomer (lib/notifications.ts) already fire
 * at essentially every meaningful business-event chokepoint across the app
 * (quotation sent/approved/force-approved, payment confirmed/rejected,
 * production stage completed, QC passed/failed, fulfillment scheduled/
 * in-transit/delivered, order/job-order completed, balance reminders,
 * vouchers applied...) and already push a "notification" SSE event to
 * exactly the right recipient. Rather than threading a second, parallel
 * "something changed, refetch" signal through every one of those call
 * sites, this reuses that existing, already-correct fan-out: whenever a
 * user's tab receives a notification, it's a reliable proxy for "something
 * relevant to this account changed," so refresh the current route's server
 * data too. router.refresh() re-runs Server Components in place (no full
 * reload, no lost client state — same mechanism every other realtime
 * listener in this app already uses); if the current page isn't affected
 * by that particular event, this is a harmless no-op re-fetch.
 */
export function RefreshOnNotification() {
  const router = useRouter();

  useEffect(() => {
    function onNotification() {
      router.refresh();
    }
    window.addEventListener("realtime:notification", onNotification);
    return () => window.removeEventListener("realtime:notification", onNotification);
  }, [router]);

  return null;
}
