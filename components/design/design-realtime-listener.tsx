"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mounted on every Graphic-Artist-facing page (dashboard, design queue) —
 * refetches this page's server data whenever any authorized viewer's
 * design-queue change is pushed over the existing SSE connection, the same
 * way ProductionRealtimeListener does for Production. Needed on top of the
 * global RefreshOnNotification: that one only fires for the specific
 * artist a notifyUser call targets, so a newly-created *unassigned* design
 * job (nobody to notify directly) would otherwise never reach anyone's
 * already-open dashboard until they manually reload.
 */
export function DesignRealtimeListener() {
  const router = useRouter();

  useEffect(() => {
    function onDesignEvent() {
      router.refresh();
    }
    window.addEventListener("realtime:design", onDesignEvent);
    return () => window.removeEventListener("realtime:design", onDesignEvent);
  }, [router]);

  return null;
}
