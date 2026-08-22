"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { searchConvertibleQuotationsAction, type QuotationSearchResult } from "@/app/actions/quotation-picker";
import { formatCurrency } from "@/lib/utils";

/**
 * Searchable combobox over APPROVED, not-yet-converted quotations — backs
 * the New Order form's "Source: From Quotation" mode (Aug 22 3rd update),
 * mirroring CustomerPicker/ServicePicker's search-as-you-type shape.
 */
export function QuotationPicker({
  name,
  initialQuotation,
  onSelect,
}: {
  name: string;
  initialQuotation?: QuotationSearchResult | null;
  onSelect?: (q: QuotationSearchResult) => void;
}) {
  const [selected, setSelected] = useState<QuotationSearchResult | null>(initialQuotation ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuotationSearchResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      searchConvertibleQuotationsAction(query).then(setResults);
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

  return (
    <div ref={boxRef} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <Label>Approved Quotation</Label>

      {selected ? (
        <div className="flex items-center justify-between rounded-md border border-slate-300 bg-slate-50 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {selected.quoteNumber} — {selected.customerName}
            </p>
            <p className="text-xs text-slate-500">{formatCurrency(selected.total)}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
            }}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            aria-label="Change quotation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search quotation number or customer..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="pl-8"
          />
          {open && (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              {results === null && <p className="px-3 py-2 text-xs text-slate-400">Searching…</p>}
              {results?.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No approved, unconverted quotations found.</p>}
              {results?.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    setSelected(q);
                    setOpen(false);
                    onSelect?.(q);
                  }}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">
                    {q.quoteNumber} — {q.customerName}
                  </span>
                  <span className="text-xs text-slate-500">{formatCurrency(q.total)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
