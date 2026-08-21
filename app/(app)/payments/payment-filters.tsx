"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { PAYMENT_FILTER_PERIODS, PAYMENT_FILTER_PERIOD_LABELS, type PaymentFilterPeriod } from "@/lib/payment-filter-periods";

/**
 * Search + Status + Period, all driving URL searchParams so the Server
 * Component page re-fetches from the database on every change — real
 * server-side filtering (lib/payments-list.ts's getPaginatedPayments),
 * never a client-side filter over an already-fetched list. Search is
 * debounced (mirrors the header GlobalSearch's 250ms debounce, adapted
 * here to push a URL update instead of fetching inline); status/period
 * selects apply immediately. Any filter change resets ?page back to 1.
 */
export function PaymentFilters({ q, status, period }: { q: string; status: string; period: PaymentFilterPeriod }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(q);

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page"); // any filter change starts back at page 1
    router.push(`${pathname}?${params.toString()}`);
  }

  // Compares against the server-rendered `q` prop (what's actually in the
  // URL right now) rather than a one-time "did this just mount" ref — a
  // mount-tracking ref is defeated by React Strict Mode's dev-only double
  // effect invocation (it fires this effect twice on mount, and a ref set
  // to false by the first pass silently lets the second pass through),
  // which previously caused a spurious push that stripped ?page= on every
  // page load. Comparing values is idempotent regardless of how many times
  // the effect runs: nothing to push once query catches up to q.
  useEffect(() => {
    if (query === q) return;
    const t = setTimeout(() => pushParams({ q: query }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, q]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search order, customer, reference..."
          className="pl-9"
        />
      </div>
      <Select value={status} onChange={(e) => pushParams({ status: e.target.value })} className="sm:w-40">
        <option value="">All Statuses</option>
        <option value="PENDING">Pending</option>
        <option value="CONFIRMED">Confirmed</option>
        <option value="REJECTED">Rejected</option>
      </Select>
      <Select value={period} onChange={(e) => pushParams({ period: e.target.value })} className="sm:w-40">
        {PAYMENT_FILTER_PERIODS.map((p) => (
          <option key={p} value={p}>
            {PAYMENT_FILTER_PERIOD_LABELS[p]}
          </option>
        ))}
      </Select>
    </div>
  );
}
