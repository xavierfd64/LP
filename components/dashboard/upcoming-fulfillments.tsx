import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { EmptyState } from "@/components/ui/table";
import type { UpcomingFulfillmentBucket } from "@/lib/dashboard-data";

/** Spec item 20 — a compact summary; an empty state never consumes a large portion of the dashboard. */
export function UpcomingFulfillments({ buckets }: { buckets: UpcomingFulfillmentBucket[] }) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Upcoming Fulfillments" actionLabel="View all" actionHref="/orders" />
      </CardHeader>
      <CardContent className="space-y-1.5">
        {buckets.length === 0 ? (
          <EmptyState label="No upcoming fulfillments." />
        ) : (
          buckets.map((b) => (
            <div key={b.label} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{b.label}</span>
              <span className="font-medium text-slate-900">{b.count} order{b.count === 1 ? "" : "s"}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
