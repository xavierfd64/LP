"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { PAYMENT_FILTER_PERIODS, PAYMENT_FILTER_PERIOD_LABELS, type PaymentFilterPeriod } from "@/lib/payment-filter-periods";

/**
 * Generic search + status + period toolbar — the same debounced,
 * URL-searchParams-driven pattern as the Payments page's own
 * payment-filters.tsx (including the fix for the React Strict Mode
 * double-effect bug: compares against the server-rendered `q` prop rather
 * than a one-time-fired ref), generalized for the Inquiries/Quotations/
 * Orders dashboards (Aug 22 UI redesign update 2) so each doesn't
 * reimplement the same debounce/URL logic with a new status enum.
 * `PAYMENT_FILTER_PERIODS` is generic in content (all/daily/monthly/
 * quarterly/annual) despite its payments-branded filename — reused as-is
 * rather than duplicated into a second, identical file.
 */
export function ListFilters({
  basePath,
  q,
  status,
  period,
  statusOptions,
  searchPlaceholder,
}: {
  basePath: string;
  q: string;
  status: string;
  period: PaymentFilterPeriod;
  statusOptions: { value: string; label: string }[];
  searchPlaceholder: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(q);

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    router.push(`${basePath}?${params.toString()}`);
  }

  useEffect(() => {
    if (query === q) return;
    const t = setTimeout(() => pushParams({ q: query }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, q]);

  return (
    <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="pl-9" />
      </div>
      <Select value={status} onChange={(e) => pushParams({ status: e.target.value })} className="sm:w-44">
        <option value="">All Statuses</option>
        {statusOptions.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
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
