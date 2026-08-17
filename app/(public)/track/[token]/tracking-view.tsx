"use client";

import { useEffect, useState } from "react";
import { getPublicOrderTrackingAction, type PublicOrderTracking } from "@/app/actions/public-tracking";
import { TrackingSnapshotCard } from "@/components/tracking/tracking-snapshot-card";

const POLL_MS = 20000;

/** Lightweight polling instead of an SSE subscription — this page has no
 * authenticated session to key a realtime channel off of, and a public,
 * unauthenticated long-lived connection isn't an appropriate surface to add
 * to the existing SSE infrastructure. 20s is frequent enough for a customer
 * checking progress without meaningfully increasing load. */
export function TrackingView({ token, initial }: { token: string; initial: PublicOrderTracking }) {
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

  if (gone) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
        <p className="font-medium text-slate-900">This tracking link is no longer available.</p>
        <p className="mt-1 text-sm text-slate-500">Please contact us for assistance.</p>
      </div>
    );
  }

  return <TrackingSnapshotCard data={data} />;
}
