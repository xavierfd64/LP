"use client";

import { useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { exportPaymentsAction } from "@/app/actions/payments-export";
import { PAYMENT_EXPORT_COLUMNS, DEFAULT_EXPORT_COLUMNS, type PaymentExportColumnKey } from "@/lib/payment-export-columns";
import type { PaymentFilterPeriod } from "@/lib/payment-filter-periods";

type WhatToExport = "all" | "columns" | "summary";
type ExportFormat = "xlsx" | "csv" | "pdf";

/**
 * Read-only export control added to the existing Payments toolbar (spec:
 * "Add Payment Export" — an addition, not a redesign). Same ad-hoc modal
 * shell already used by RecordPaymentModal (fixed overlay, centered white
 * card, header+close, footer actions) rather than a new modal paradigm.
 *
 * `q`/`status`/`period` are the exact same current-filter values the page
 * already parsed for PaymentFilters/getPaginatedPayments — passed straight
 * through as the default "All payments (current filters)" export scope, so
 * "what's on screen" and "what gets exported" can never disagree.
 */
export function ExportPaymentsDialog({
  q,
  status,
  period,
}: {
  q: string;
  status: string;
  period: PaymentFilterPeriod;
}) {
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState<WhatToExport>("all");
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [selectedColumns, setSelectedColumns] = useState<Set<PaymentExportColumnKey>>(new Set(DEFAULT_EXPORT_COLUMNS));
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [includeTotals, setIncludeTotals] = useState(false);
  const [includeProofLinks, setIncludeProofLinks] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleColumn(key: PaymentExportColumnKey) {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleExport() {
    if (exporting) return; // prevents a duplicate export request from a fast double-click
    setExporting(true);
    setError(null);
    try {
      const statusValue = status === "PENDING" || status === "CONFIRMED" || status === "REJECTED" ? status : undefined;

      if (format === "pdf") {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (statusValue) params.set("status", statusValue);
        params.set("period", period);
        params.set("what", what);
        if (what === "columns") params.set("columns", Array.from(selectedColumns).join(","));
        params.set("includeHeaders", String(includeHeaders));
        params.set("includeTotals", String(includeTotals));
        params.set("includeProofLinks", String(includeProofLinks));
        // New tab, current tab stays on /payments — matches this app's
        // existing "export as PDF" pattern (reports/summary links to its
        // print view with target="_blank" too).
        window.open(`/payments/export?${params.toString()}`, "_blank");
        setOpen(false);
        return;
      }

      const result = await exportPaymentsAction({
        q: q || undefined,
        status: statusValue,
        period,
        what,
        columns: what === "columns" ? Array.from(selectedColumns) : undefined,
        format,
        includeHeaders,
        includeTotals,
        includeProofLinks,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Download className="mr-1.5 h-4 w-4" />
        Export
        <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Export Payments</h2>
                <p className="text-xs text-slate-500">Choose what data you want to export and the format.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              {error && <Alert tone="error">{error}</Alert>}

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What to export</h3>
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 p-2.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                      <input type="radio" name="what" className="mt-0.5" checked={what === "all"} onChange={() => setWhat("all")} />
                      <span>
                        <span className="block font-medium text-slate-900">All payments (current filters)</span>
                        <span className="block text-xs text-slate-500">Export all payments based on the current search and filter settings.</span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 p-2.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                      <input type="radio" name="what" className="mt-0.5" checked={what === "columns"} onChange={() => setWhat("columns")} />
                      <span>
                        <span className="block font-medium text-slate-900">Selected columns</span>
                        <span className="block text-xs text-slate-500">Choose specific fields to include in the export.</span>
                      </span>
                    </label>
                    {what === "columns" && (
                      <div className="ml-6 grid grid-cols-1 gap-1 rounded-md bg-slate-50 p-2.5 sm:grid-cols-2">
                        {PAYMENT_EXPORT_COLUMNS.filter((c) => c.key !== "proofLink").map((c) => (
                          <label key={c.key} className="flex items-center gap-1.5 text-xs text-slate-700">
                            <input type="checkbox" checked={selectedColumns.has(c.key)} onChange={() => toggleColumn(c.key)} />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    )}
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 p-2.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                      <input type="radio" name="what" className="mt-0.5" checked={what === "summary"} onChange={() => setWhat("summary")} />
                      <span>
                        <span className="block font-medium text-slate-900">Summary only</span>
                        <span className="block text-xs text-slate-500">Export a summary of payments — totals by status, method, etc.</span>
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Format</h3>
                  <div className="space-y-2">
                    {(
                      [
                        { value: "xlsx", label: "Excel (.xlsx)", desc: "Best for data analysis and spreadsheets." },
                        { value: "csv", label: "CSV (.csv)", desc: "Best for importing to other systems." },
                        { value: "pdf", label: "PDF (.pdf)", desc: "Best for sharing and printing." },
                      ] as const
                    ).map((f) => (
                      <label
                        key={f.value}
                        className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 p-2.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
                      >
                        <input type="radio" name="format" className="mt-0.5" checked={format === f.value} onChange={() => setFormat(f.value)} />
                        <span>
                          <span className="block font-medium text-slate-900">{f.label}</span>
                          <span className="block text-xs text-slate-500">{f.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Additional options</h3>
                  <div className="space-y-1.5 text-sm text-slate-700">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={includeHeaders} onChange={(e) => setIncludeHeaders(e.target.checked)} />
                      Include column headers
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={includeTotals} onChange={(e) => setIncludeTotals(e.target.checked)} />
                      Include totals/summary row
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={includeProofLinks} onChange={(e) => setIncludeProofLinks(e.target.checked)} />
                      Include payment proof links
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={exporting}>
                Cancel
              </Button>
              <Button type="button" onClick={handleExport} disabled={exporting}>
                {exporting ? (
                  "Exporting..."
                ) : (
                  <>
                    <Download className="mr-1.5 h-4 w-4" />
                    Export
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
