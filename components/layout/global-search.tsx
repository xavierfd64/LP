"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, QrCode } from "lucide-react";
import { Input } from "@/components/ui/input";
import { globalSearchAction, type GlobalSearchResult } from "@/app/actions/global-search";
import { interpretScannedValue } from "@/lib/scan-utils";
import { QrScannerModal } from "./qr-scanner-modal";

const GROUPS: { key: keyof GlobalSearchResult; label: string; href: (id: string) => string }[] = [
  { key: "customers", label: "Customers", href: (id) => `/customers/${id}` },
  { key: "quotations", label: "Quotations", href: (id) => `/quotations/${id}` },
  { key: "jobOrders", label: "Job Orders", href: (id) => `/job-orders/${id}` },
  { key: "orders", label: "Orders / Invoices", href: (id) => `/orders/${id}` },
];

/**
 * Header global search (spec item 9) — debounced search-as-you-type across
 * Customers/Quotations/Job Orders/Orders, reusing globalSearchAction's
 * permission-gated results. Extended (LP System Update) to also work as
 * the desktop USB QR/barcode reader target and the mobile/tablet camera
 * scanner's destination: a hardware reader just "types" the scanned text
 * into whichever field has focus and sends Enter — this is a plain text
 * input, so that already works without any special integration; what's
 * new is recognizing *what* got typed. This app's own QR codes encode a
 * full URL to the document's page (see lib/qr-code.ts), so Enter (or a
 * scan result) first checks for that and navigates directly with no
 * search step; a bare reference number/free text still runs the existing
 * substring search, auto-navigating only when it resolves to exactly one
 * match.
 */
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
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

  const singleMatchHref = useMemo(() => {
    if (!results) return null;
    const matches = GROUPS.flatMap((g) => results[g.key].map((item) => g.href(item.id)));
    return matches.length === 1 ? matches[0] : null;
  }, [results]);

  function goToPath(path: string) {
    setOpen(false);
    setQuery("");
    setResults(null);
    router.push(path);
  }

  /** Shared by both Enter-in-the-search-box and a completed camera scan — same "direct link vs. reference number" interpretation either way. */
  async function resolveAndNavigate(raw: string) {
    const scanned = interpretScannedValue(raw);
    if (scanned.type === "internal-path") {
      goToPath(scanned.path);
      return;
    }
    // Bare reference number (or free text): search, then jump straight to
    // the one match — a scan/manual entry that resolves to exactly one
    // real transaction shouldn't need a second click.
    const found = await globalSearchAction(scanned.value);
    const matches = GROUPS.flatMap((g) => found[g.key].map((item) => g.href(item.id)));
    if (matches.length === 1) {
      goToPath(matches[0]);
    } else {
      setQuery(scanned.value);
      setOpen(true);
    }
  }

  return (
    <div ref={boxRef} className="relative flex w-full max-w-md items-center gap-1.5">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const raw = query.trim();
            if (!raw) return;
            e.preventDefault();
            // A direct-link scan resolves instantly even before the
            // debounced search below would ever return a match (a URL
            // never matches any quoteNumber/joNumber/orderNumber
            // substring), and a single already-loaded result should
            // navigate immediately rather than waiting on a re-search.
            const scanned = interpretScannedValue(raw);
            if (scanned.type === "internal-path") {
              goToPath(scanned.path);
            } else if (singleMatchHref) {
              goToPath(singleMatchHref);
            } else {
              resolveAndNavigate(raw);
            }
          }}
          placeholder="Search customers, quotations, orders, invoices…"
          className="pl-8"
        />
      </div>
      {/* A true sibling flex item, not an overlay on top of the input — the
          QR button gets its own fixed, dedicated width so it can never
          overlap or clip the search text at any viewport size, however
          long the placeholder/typed value gets. Mobile/tablet only
          (desktop uses a USB QR/barcode reader typed straight into the
          field above, no camera button needed there). */}
      <button
        type="button"
        onClick={() => setScannerOpen(true)}
        aria-label="Scan QR Code"
        className="shrink-0 rounded-md border border-slate-300 bg-white p-[7px] text-slate-500 hover:bg-slate-50 hover:text-slate-700 min-[1400px]:hidden"
      >
        <QrCode className="h-4 w-4" />
      </button>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
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
                      onClick={() => goToPath(g.href(item.id))}
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

      {scannerOpen && (
        <QrScannerModal
          onClose={() => setScannerOpen(false)}
          onScan={(value) => {
            setScannerOpen(false);
            resolveAndNavigate(value);
          }}
        />
      )}
    </div>
  );
}
