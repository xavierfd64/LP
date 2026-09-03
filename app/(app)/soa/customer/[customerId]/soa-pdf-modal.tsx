"use client";

import { useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Select, Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { generateStatementForRangeAction } from "@/app/actions/soa";
import { SOA_DATE_RANGE_OPTIONS, type SoaDateRangeValue } from "./soa-filters";
import { resolveClientPeriod } from "./resolve-client-period";

/**
 * "Save as PDF" Quick Action (SOA UI/UX improvement, Sept 3) — the direct
 * PDF shortcut: pick a range, generate the statement via the existing
 * generateStatementForRangeAction (createStatementAndNotify — the one
 * place a StatementOfAccount row is ever created), then open the existing
 * DocumentShell-styled /soa/[id]/print route, the same "Generate PDF"
 * destination /soa/view/[id] already links to. No second PDF pipeline.
 */
export function SoaPdfModal({
  customerId,
  buttonIcon: ButtonIcon,
  initialRange,
  initialFrom,
  initialTo,
}: {
  customerId: string;
  buttonIcon?: ComponentType<{ className?: string }>;
  initialRange: SoaDateRangeValue;
  initialFrom: string;
  initialTo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<SoaDateRangeValue>(initialRange);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setError(null);
    const { start, end } = resolveClientPeriod(range, from, to);
    if (end <= start) {
      setError("The end date must be after the start date.");
      return;
    }
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
  }

  return (
    <>
      <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setOpen(true)}>
        {ButtonIcon && <ButtonIcon className="h-4 w-4" />} Save as PDF
      </Button>

      {open && (
        <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Save as PDF</h2>
                <p className="text-xs text-slate-500">Download the Statement of Account as a PDF.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              {error && <Alert tone="error">{error}</Alert>}
              <div>
                <Label htmlFor="pdfRange">Date Range</Label>
                <Select id="pdfRange" value={range} onChange={(e) => setRange(e.target.value as SoaDateRangeValue)}>
                  {SOA_DATE_RANGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              {range === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="pdfFrom">From</Label>
                    <Input id="pdfFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="pdfTo">To</Label>
                    <Input id="pdfTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleDownload} disabled={loading}>
                {loading ? "Generating…" : "Download PDF"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
