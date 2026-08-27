"use client";

import { useState } from "react";
import { forceApproveQuotationFromModalAction } from "@/app/actions/quotations";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

/**
 * Approve on Behalf of Customer (Aug 27 final update) — the Quotation
 * Details popup's Approve button opens this SECOND dialog rather than
 * approving immediately, matching PaymentExemptionDialog's exact modal
 * shell/mobile-safe sizing so it fits desktop/tablet/mobile the same way
 * every other popup-over-popup in this app already does. Reuses
 * forceApproveQuotationFromModalAction — the same approvedByStaffId/
 * approvalBypassReason fields, audit entry, and downstream conversion the
 * full quotation page's rush-approval bypass already uses; this is not a
 * second approval mechanism.
 */
export function ApproveOnBehalfDialog({ quotationId, onApproved }: { quotationId: string; onApproved: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setReason("");
    setError(undefined);
  }

  async function handleConfirm() {
    if (!reason.trim()) {
      setError("Enter a reason for approving on the customer's behalf.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await forceApproveQuotationFromModalAction(quotationId, reason.trim());
      setSubmitting(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      onApproved();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Approve
      </Button>

      {open && (
        <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Approve on Behalf of Customer</h2>
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

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {error && <Alert tone="error">{error}</Alert>}

              <Alert tone="warning">
                You are approving this quotation on the customer&apos;s behalf, bypassing their own direct approval.
                This is recorded separately in the audit trail from a genuine customer approval, along with your
                identity and the reason below.
              </Alert>

              <div>
                <Label htmlFor="ap-reason">Reason for Approval</Label>
                <Textarea
                  id="ap-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Rush order, verbally confirmed by client..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                <Button type="button" onClick={handleConfirm} disabled={submitting}>
                  {submitting ? "Approving..." : "Confirm Approval"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
