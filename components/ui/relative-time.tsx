"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/utils";

function relativeFrom(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDateTime(iso);
}

/**
 * "Last updated: 2 mins ago" (Production Overview, illustration 1).
 * `formatDateTime`'s `toLocaleString` resolves the *runtime's* local
 * timezone when none is passed explicitly — the same known class of bug
 * already fixed once for Order Detail timestamps (see other
 * suppressHydrationWarning call sites in this codebase, e.g.
 * form-details-view.tsx) — so the server's absolute-timestamp fallback and
 * the browser's own first paint of that same fallback can legitimately
 * render different text whenever the server and the visiting browser sit
 * in different timezones. suppressHydrationWarning is the established fix
 * here: React keeps the browser's version rather than erroring.
 */
export function RelativeTime({ iso }: { iso: string }) {
  const [mounted, setMounted] = useState(false);
  const [, forceTick] = useState(0);
  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => forceTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{mounted ? relativeFrom(iso) : formatDateTime(iso)}</span>;
}
