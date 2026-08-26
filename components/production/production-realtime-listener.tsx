"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mounted on every Production-facing page (Overview, the focused board) —
 * refetches this page's server data whenever any authorized user's
 * production change is pushed over the existing SSE connection (3rd Update
 * item 2). `router.refresh()` re-runs the server components in place
 * without losing client-side UI state (open dialogs, filters, scroll
 * position), the same mechanism every write action here already uses on
 * its own success.
 */
export function ProductionRealtimeListener() {
  const router = useRouter();

  useEffect(() => {
    function onProductionEvent() {
      router.refresh();
    }
    window.addEventListener("realtime:production", onProductionEvent);
    return () => window.removeEventListener("realtime:production", onProductionEvent);
  }, [router]);

  return null;
}
