"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPublicOrderTrackingAction, type PublicOrderTracking } from "@/app/actions/public-tracking";
import { TrackingSnapshotCard } from "@/components/tracking/tracking-snapshot-card";
import { LinkUnavailable } from "./link-unavailable";

const POLL_MS = 20000;

/** Lightweight polling instead of an SSE subscription — this page has no
 * authenticated session to key a realtime channel off of, and a public,
 * unauthenticated long-lived connection isn't an appropriate surface to add
 * to the existing SSE infrastructure. 20s is frequent enough for a customer
 * checking progress without meaningfully increasing load. */
export function TrackingView({ token, initial, supportHref }: { token: string; initial: PublicOrderTracking; supportHref: string | null }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const id = setInterval(async () => {
      const result = await getPublicOrderTrackingAction(token);
      if (result.ok) setData(result.data);
      else setGone(true);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [token]);

  if (gone) return <LinkUnavailable />;

  // "Back" from a dedicated /track/[token] link has nowhere local to
  // return to (unlike the reference-lookup flow's in-place state reset),
  // so it's a real navigation back to the public tracking form.
  return <TrackingSnapshotCard data={data} supportHref={supportHref} onBack={() => router.push("/track")} />;
}
