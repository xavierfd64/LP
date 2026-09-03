"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select, Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const SOA_DATE_RANGE_OPTIONS = [
  { value: "all", label: "All Transactions / All Time" },
  { value: "monthly", label: "This Month" },
  { value: "quarterly", label: "This Quarter" },
  { value: "annual", label: "This Year" },
  { value: "custom", label: "Custom Range" },
] as const;
export type SoaDateRangeValue = (typeof SOA_DATE_RANGE_OPTIONS)[number]["value"];

export const SOA_TYPE_OPTIONS = [
  { value: "all", label: "All Transactions" },
  { value: "orders", label: "Orders / Invoices" },
  { value: "payments", label: "Payments" },
  { value: "outstanding", label: "Outstanding Only" },
  { value: "overdue", label: "Overdue Only" },
] as const;
export type SoaTypeValue = (typeof SOA_TYPE_OPTIONS)[number]["value"];

/**
 * SOA dashboard's Date Range + Transaction Type toolbar (SOA UI/UX
 * improvement, Sept 3) — same URL-searchParams-driven pattern as
 * PaymentFilters/ListFilters (a real server re-fetch via
 * computeStatementOfAccount, never a client-side filter over an
 * already-fetched list), kept as its own small component rather than
 * reusing ListFilters/PaymentFilters directly since neither carries a
 * "Custom Range" option or a customer-scoped Transaction Type axis.
 * Selecting "Custom Range" reveals From/To date inputs and requires
 * Apply; every other option applies immediately.
 */
export function SoaFilters({
  range,
  from,
  to,
  type,
}: {
  range: SoaDateRangeValue;
  from: string;
  to: string;
  type: SoaTypeValue;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="sm:w-52">
        <Label htmlFor="soaRange">Date Range</Label>
        <Select
          id="soaRange"
          value={range}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "custom") {
              pushParams({ range: next, from: customFrom, to: customTo });
            } else {
              pushParams({ range: next, from: "", to: "" });
            }
          }}
        >
          {SOA_DATE_RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      {range === "custom" && (
        <>
          <div>
            <Label htmlFor="soaFrom">From</Label>
            <Input id="soaFrom" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="soaTo">To</Label>
            <Input id="soaTo" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
          <Button
            type="button"
            onClick={() => pushParams({ range: "custom", from: customFrom, to: customTo })}
            disabled={!customFrom || !customTo}
          >
            Apply
          </Button>
        </>
      )}

      <div className="sm:w-52">
        <Label htmlFor="soaType">Transactions</Label>
        <Select id="soaType" value={type} onChange={(e) => pushParams({ type: e.target.value })}>
          {SOA_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
