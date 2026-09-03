"use client";

import { useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Select, Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { previewStatementOfAccountAction, generateStatementForRangeAction, type SoaLedgerPreview } from "@/app/actions/soa";
import { SOA_DATE_RANGE_OPTIONS, type SoaDateRangeValue } from "./soa-filters";
import { resolveClientPeriod } from "./resolve-client-period";

function typeLabel(type: "ORDER" | "PAYMENT" | "ADJUSTMENT") {
  return type === "ORDER" ? "Order" : type === "PAYMENT" ? "Payment" : "Adjustment";
}

/**
 * Shared "range preview" pop-up (SOA UI/UX improvement, Sept 3) behind
 * both the "View / Print SOA" and "Customer Transaction History" Quick
 * Actions — same Date Range + Include controls, same live preview table
 * fetched via previewStatementOfAccountAction (a read-only wrapper around
 * computeStatementOfAccount, never a second calculation, never persisted).
 * `allowPdf` adds the Preview on Screen / PDF format choice: PDF calls
 * generateStatementForRangeAction (the existing statement-generation path)
 * and opens the real print document in a new tab, exactly like every
 * other "Generate PDF" button in the app.
 */
export function SoaRangePreviewModal({
  customerId,
  buttonLabel,
  buttonIcon: ButtonIcon,
  title,
  subtitle,
  allowPdf,
  initialRange,
  initialFrom,
  initialTo,
}: {
  customerId: string;
  buttonLabel: string;
  buttonIcon?: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  allowPdf: boolean;
  initialRange: SoaDateRangeValue;
  initialFrom: string;
  initialTo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<SoaDateRangeValue>(initialRange);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [includeOrders, setIncludeOrders] = useState(true);
  const [includePayments, setIncludePayments] = useState(true);
  const [format, setFormat] = useState<"screen" | "pdf">("screen");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SoaLedgerPreview | null>(null);

  function reset() {
    setPreview(null);
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    const { start, end } = resolveClientPeriod(range, from, to);
    if (end <= start) {
      setError("The end date must be after the start date.");
      return;
    }

    if (allowPdf && format === "pdf") {
      setLoading(true);
      try {
        const { statementId } = await generateStatementForRangeAction(customerId, start.toISOString(), end.toISOString());
        window.open(`/soa/${statementId}/print`, "_blank");
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate the statement.");
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const data = await previewStatementOfAccountAction(customerId, start.toISOString(), end.toISOString());
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the statement.");
    } finally {
      setLoading(false);
    }
  }

  const filteredRows = preview
    ? preview.rows.filter((r) => {
        if (r.type === "ORDER") return includeOrders;
        if (r.type === "PAYMENT") return includePayments;
        return true;
      })
    : [];

  return (
    <>
      <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setOpen(true)}>
        {ButtonIcon && <ButtonIcon className="h-4 w-4" />} {buttonLabel}
      </Button>

      {open && (
        <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
                <p className="text-xs text-slate-500">{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-4">
              {error && <Alert tone="error">{error}</Alert>}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="previewRange">Date Range</Label>
                  <Select id="previewRange" value={range} onChange={(e) => setRange(e.target.value as SoaDateRangeValue)}>
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
                      <Label htmlFor="previewFrom">From</Label>
                      <Input id="previewFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="previewTo">To</Label>
                      <Input id="previewTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Include</span>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={includeOrders} onChange={(e) => setIncludeOrders(e.target.checked)} />
                  Orders / Invoices
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={includePayments} onChange={(e) => setIncludePayments(e.target.checked)} />
                  Payments
                </label>
              </div>

              {allowPdf && (
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Format</span>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="format" checked={format === "screen"} onChange={() => setFormat("screen")} />
                    Preview on Screen
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="format" checked={format === "pdf"} onChange={() => setFormat("pdf")} />
                    PDF
                  </label>
                </div>
              )}

              {preview && (allowPdf ? format === "screen" : true) && (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Total Charges</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(preview.totalCharges)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Total Payments</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(preview.totalPayments)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Outstanding</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(Math.max(preview.outstandingBalance, 0))}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-md border border-slate-100">
                    <Table>
                      <THead>
                        <TR>
                          <TH>Date</TH>
                          <TH>Type</TH>
                          <TH>Reference</TH>
                          <TH>Charges</TH>
                          <TH>Payments</TH>
                          <TH>Balance</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {filteredRows.map((r, i) => (
                          <TR key={i}>
                            <TD className="whitespace-nowrap text-sm">{formatDate(r.date)}</TD>
                            <TD className="text-sm">
                              {typeLabel(r.type)}
                              {r.isHistorical ? " (Old)" : ""}
                            </TD>
                            <TD className="text-sm font-medium text-slate-900">{r.reference}</TD>
                            <TD>{r.charge > 0 ? formatCurrency(r.charge) : "—"}</TD>
                            <TD>{r.payment > 0 ? formatCurrency(r.payment) : "—"}</TD>
                            <TD className="font-medium">{formatCurrency(r.runningBalance)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                    {filteredRows.length === 0 && <EmptyState label="No transactions match this filter." />}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={loading}>
                {loading ? "Loading…" : allowPdf && format === "pdf" ? "Generate PDF" : allowPdf ? "Preview SOA" : "View History"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
