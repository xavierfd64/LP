"use client";

import { useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { PaymentFilterPeriod } from "@/lib/payment-filter-periods";

export type ListExportColumn = { key: string; label: string };
export type ListExportInput = {
  q?: string;
  status?: string;
  period?: PaymentFilterPeriod;
  what: "all" | "columns" | "summary";
  columns?: string[];
  format: "xlsx" | "csv";
  includeHeaders: boolean;
  includeTotals: boolean;
};
export type ListExportResult = { ok: true; filename: string; mimeType: string; base64: string } | { ok: false; error: string };

/**
 * Generic export dialog shared by the Inquiries/Quotations/Orders
 * dashboards (Aug 22 UI redesign update 2, Part 9) — the same shape as
 * the Payments page's own ExportPaymentsDialog (export-payments-dialog.tsx,
 * kept as-is rather than migrated), minus the payment-proof-links option,
 * which has no equivalent concept in these modules. Each module passes
 * its own column list and its own server action; the mechanics (CSV/XLSX
 * via server action + Blob download, PDF via the existing print-route
 * pattern in a new tab) are identical, so this is the one place that logic
 * lives instead of three copies of it.
 */
export function ListExportDialog({
  moduleLabel,
  q,
  status,
  period,
  columns,
  defaultColumns,
  hasAmountColumn,
  exportAction,
  pdfPath,
}: {
  moduleLabel: string;
  q: string;
  status: string;
  period: PaymentFilterPeriod;
  columns: ListExportColumn[];
  defaultColumns: string[];
  hasAmountColumn: boolean;
  exportAction: (input: ListExportInput) => Promise<ListExportResult>;
  pdfPath: string;
}) {
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState<"all" | "columns" | "summary">("all");
  const [format, setFormat] = useState<"xlsx" | "csv" | "pdf">("xlsx");
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(defaultColumns));
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [includeTotals, setIncludeTotals] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleColumn(key: string) {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      if (format === "pdf") {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (status) params.set("status", status);
        params.set("period", period);
        params.set("what", what);
        if (what === "columns") params.set("columns", Array.from(selectedColumns).join(","));
        params.set("includeHeaders", String(includeHeaders));
        params.set("includeTotals", String(includeTotals));
        window.open(`${pdfPath}?${params.toString()}`, "_blank");
        setOpen(false);
        return;
      }

      const result = await exportAction({
        q: q || undefined,
        status: status || undefined,
        period,
        what,
        columns: what === "columns" ? Array.from(selectedColumns) : undefined,
        format,
        includeHeaders,
        includeTotals,
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
        <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Export {moduleLabel}</h2>
                <p className="text-xs text-slate-500">Choose what data you want to export and the format.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
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
                        <span className="block font-medium text-slate-900">All {moduleLabel.toLowerCase()} (current filters)</span>
                        <span className="block text-xs text-slate-500">Export based on the current search and filter settings.</span>
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
                        {columns.map((c) => (
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
                        <span className="block text-xs text-slate-500">Export a summary — totals by status.</span>
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
                    {hasAmountColumn && (
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={includeTotals} onChange={(e) => setIncludeTotals(e.target.checked)} />
                        Include totals/summary row
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={exporting}>
                Cancel
              </Button>
              <Button type="button" onClick={handleExport} disabled={exporting}>
                {exporting ? "Exporting..." : (
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
