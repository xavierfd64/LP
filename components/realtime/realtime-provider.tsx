"use client";

import { useEffect } from "react";

/**
 * Mounted once near the root of the authenticated shell. Opens a single
 * Server-Sent Events connection and rebroadcasts each event as a window
 * CustomEvent ("realtime:message" / "realtime:notification") so any client
 * component anywhere in the tree (notification bell, an open message
 * thread, the messages inbox list) can listen without needing its own
 * connection or a shared React context.
 */
export function RealtimeProvider() {
  useEffect(() => {
    const source = new EventSource("/api/realtime");

    source.onmessage = (event) => {
      let data: { type?: string } | null = null;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!data || data.type === "connected") return;
      if (data.type === "message") {
        window.dispatchEvent(new CustomEvent("realtime:message", { detail: data }));
      } else if (data.type === "notification") {
        window.dispatchEvent(new CustomEvent("realtime:notification", { detail: data }));
      } else if (data.type === "production") {
        window.dispatchEvent(new CustomEvent("realtime:production"));
      }
    };

    return () => {
      source.close();
    };
  }, []);

  return null;
}
