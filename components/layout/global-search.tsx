"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { globalSearchAction, type GlobalSearchResult } from "@/app/actions/global-search";

const GROUPS: { key: keyof GlobalSearchResult; label: string; href: (id: string) => string }[] = [
  { key: "customers", label: "Customers", href: (id) => `/customers/${id}` },
  { key: "quotations", label: "Quotations", href: (id) => `/quotations/${id}` },
  { key: "jobOrders", label: "Job Orders", href: (id) => `/job-orders/${id}` },
  { key: "orders", label: "Orders / Invoices", href: (id) => `/orders/${id}` },
];

/** Header global search (spec item 9) — debounced search-as-you-type across Customers/Quotations/Job Orders/Orders, reusing globalSearchAction's permission-gated results. */
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      globalSearchAction(query).then(setResults);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const hasResults = results && GROUPS.some((g) => results[g.key].length > 0);

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search customers, quotations, orders, invoices…"
          className="pl-8"
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-96 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {!results ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">Searching…</p>
          ) : !hasResults ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">No matches found.</p>
          ) : (
            GROUPS.map((g) => {
              const items = results[g.key];
              if (items.length === 0) return null;
              return (
                <div key={g.key} className="border-b border-slate-50 last:border-0">
                  <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                      onClick={() => {
                        setOpen(false);
                        setQuery("");
                        router.push(g.href(item.id));
                      }}
                    >
                      <span className="font-medium text-slate-900">{item.label}</span>{" "}
                      <span className="text-slate-400">— {item.sub}</span>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
