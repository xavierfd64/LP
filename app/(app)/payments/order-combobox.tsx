"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchOrdersForPaymentAction, type OrderSearchResult } from "@/app/actions/order-search";

/**
 * Searchable Order/Transaction selector for the Record Payment form
 * (replaces the old plain <Select> that loaded every order into the page).
 * Mirrors components/layout/global-search.tsx's debounced-search +
 * click-away pattern rather than introducing a new selector paradigm.
 *
 * Browsing and searching are the same code path: clicking the field with
 * nothing typed calls searchOrdersForPaymentAction("") which returns the
 * most recent orders (server-side, capped), so "click to browse" and
 * "type to search" both go through one permission-gated, take-limited
 * query — never a full order list loaded into the browser.
 *
 * The chosen order's id is the only thing recordPaymentAction ever sees
 * (via the hidden `name` input) — identical to what the old <Select>
 * submitted, so no change to the server action's data contract.
 */
export function OrderCombobox({
  name,
  defaultOrder,
  onSelectionChange,
}: {
  name: string;
  defaultOrder?: OrderSearchResult | null;
  onSelectionChange?: (orderId: string) => void;
}) {
  const [selected, setSelected] = useState<OrderSearchResult | null>(defaultOrder ?? null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrderSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (defaultOrder) onSelectionChange?.(defaultOrder.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      searchOrdersForPaymentAction(query).then((r) => {
        setResults(r);
        setLoading(false);
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={open ? query : selected ? `${selected.orderNumber} — ${selected.customerName}` : ""}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Select transaction..."
          className="pl-9"
          autoComplete="off"
        />
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">Searching…</p>
          ) : !results || results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">No matching transactions found.</p>
          ) : (
            results.map((o) => (
              <button
                key={o.id}
                type="button"
                className="block w-full border-b border-slate-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
                onClick={() => {
                  setSelected(o);
                  onSelectionChange?.(o.id);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="font-medium text-slate-900">{o.orderNumber}</span>
                <span className="block text-xs text-slate-500">
                  {o.customerName}
                  {o.customerPhone ? ` · ${o.customerPhone}` : ""}
                </span>
                {o.quoteNumber && <span className="block text-xs text-slate-400">Quotation: {o.quoteNumber}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
