"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Drop this on any Server Component page that renders conversation previews
 * (the /messages inbox list) to keep it live. The SSE stream is already
 * scoped server-side to events meant for the current user, so any
 * "realtime:message" received here is relevant — just re-run the page's
 * server data fetch.
 */
export function RefreshOnMessage() {
  const router = useRouter();

  useEffect(() => {
    function onMessage() {
      router.refresh();
    }
    window.addEventListener("realtime:message", onMessage);
    return () => window.removeEventListener("realtime:message", onMessage);
  }, [router]);

  return null;
}
