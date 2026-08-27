"use client";

import { useEffect, useState } from "react";
import { X, Lock, PackageCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";
import { getReadyForFulfillmentDataAction, type ReadyForFulfillmentData } from "@/app/actions/production";
import { releaseJobOrderFromBoardAction, grantReleaseExceptionFromBoardAction } from "@/app/actions/payments";
import { markOrderCompletedFromBoardAction } from "@/app/actions/fulfillment";

/**
 * Ready for Fulfillment card's popup (1st Update item 3) — replaces
 * navigating to the job order page, which offered little beyond a bare
 * Release button (or nothing at all once actually released, since a
 * RELEASED job order used to vanish from every board query). Two states
 * driven by the job order's real status: READY still needs Release
 * (payment-gated exactly as before — this does not weaken that control),
 * RELEASED needs the existing "Mark Order as Completed" action and
 * nothing else — never both, never a repeated Release.
 */
export function ReadyForFulfillmentModal({
  jobOrderId,
  onClose,
  onDone,
}: {
  jobOrderId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [data, setData] = useState<ReadyForFulfillmentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [exceptionBy, setExceptionBy] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");

  useEffect(() => {
    if (!jobOrderId) return;
    setData(null);
    setError(null);
    setShowExceptionForm(false);
    setLoading(true);
    getReadyForFulfillmentDataAction(jobOrderId)
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load fulfillment details."))
      .finally(() => setLoading(false));
  }, [jobOrderId]);

  if (!jobOrderId) return null;

  const canRelease = data ? data.fullyPaid || data.releaseException : false;

  async function handleRelease() {
    if (!data) return;
    setSubmitting(true);
    setError(null);
    const result = await releaseJobOrderFromBoardAction(data.jobOrderId);
    setSubmitting(false);
    if (!result.ok) setError(result.error);
    else onDone();
  }

  async function handleGrantException() {
    if (!data) return;
    if (!exceptionBy.trim() || !exceptionReason.trim()) {
      setError("Enter who authorized the exception and why.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await grantReleaseExceptionFromBoardAction(data.orderId, exceptionBy.trim(), exceptionReason.trim());
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Refresh to pick up releaseException=true, then let the user release.
    const refreshed = await getReadyForFulfillmentDataAction(data.jobOrderId);
    setData(refreshed);
    setShowExceptionForm(false);
  }

  async function handleComplete() {
    if (!data) return;
    setSubmitting(true);
    setError(null);
    const result = await markOrderCompletedFromBoardAction(data.orderId);
    setSubmitting(false);
    if (!result.ok) setError(result.error);
    else onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">
            {data?.status === "RELEASED" ? "Complete Order" : "Release for Fulfillment"}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading && <p className="py-6 text-center text-sm text-slate-400">Loading…</p>}
          {!loading && !data && <p className="py-6 text-center text-sm text-slate-400">Job order not found.</p>}
          {error && <Alert tone="error">{error}</Alert>}

          {data && data.status === "RELEASED" && (
            <>
              <div className="flex items-center gap-3 rounded-md bg-green-50 p-3 text-sm text-green-800">
                <PackageCheck className="h-5 w-5 shrink-0" />
                <p>
                  <span className="font-medium">{data.joNumber}</span> ({data.orderNumber}) has already been released. Completing
                  the order will mark it <span className="font-medium">COMPLETED</span> — no further release is needed.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleComplete} disabled={submitting}>
                  {submitting ? "Completing…" : "Mark Order as Completed"} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}

          {data && data.status === "READY" && !canRelease && !showExceptionForm && (
            <>
              <div className="flex items-start gap-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
                <Lock className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">Cannot release yet</p>
                  <p className="mt-1">
                    Full payment required ({formatCurrency(data.confirmed)} of {formatCurrency(data.total)} confirmed), or an
                    authorized release exception.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={onClose}>
                  Close
                </Button>
                <Button type="button" onClick={() => setShowExceptionForm(true)}>
                  Grant Release Exception
                </Button>
              </div>
            </>
          )}

          {data && data.status === "READY" && !canRelease && showExceptionForm && (
            <>
              <p className="text-sm text-slate-600">
                Authorize releasing <span className="font-medium">{data.joNumber}</span> without full payment (e.g. a government or
                trusted business account with approved terms).
              </p>
              <div>
                <Label htmlFor="ex-by">Authorized by</Label>
                <Input id="ex-by" value={exceptionBy} onChange={(e) => setExceptionBy(e.target.value)} placeholder="Name of approving manager" />
              </div>
              <div>
                <Label htmlFor="ex-reason">Reason</Label>
                <Textarea id="ex-reason" value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} rows={2} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setShowExceptionForm(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleGrantException} disabled={submitting}>
                  {submitting ? "Granting…" : "Grant Exception"}
                </Button>
              </div>
            </>
          )}

          {data && data.status === "READY" && canRelease && (
            <>
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <p>
                  <span className="text-slate-500">Job Order: </span>
                  <span className="font-medium text-slate-900">{data.joNumber}</span>
                </p>
                <p>
                  <span className="text-slate-500">Order: </span>
                  <span className="font-medium text-slate-900">{data.orderNumber}</span>
                </p>
                <p>
                  <span className="text-slate-500">Payment: </span>
                  <span className="font-medium text-slate-900">
                    {data.fullyPaid ? "Fully paid" : "Released under an authorized exception"}
                  </span>
                </p>
              </div>
              <p className="text-sm text-slate-600">This job is ready to be released for fulfillment/delivery.</p>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleRelease} disabled={submitting}>
                  {submitting ? "Releasing…" : "Confirm Release"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
