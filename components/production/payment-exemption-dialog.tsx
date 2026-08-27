"use client";

import { useState } from "react";
import { grantPaymentExemptionAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";

/**
 * Payment Exemption dialog (1st Update item 4) — styled to match
 * RecordPaymentDialog exactly (same modal shell, spacing, field layout,
 * footer button order) since it sits right next to it in the Quotation
 * View popup's footer. Waives the partial-payment requirement for a
 * trusted customer (government project, approved business account) by
 * granting the same APPROVED_TERMS state Customer.isQualifiedForTerms
 * already grants automatically — it never creates a Payment row or
 * touches the confirmed/paid total, so the balance due here stays a real,
 * truthful receivable. onGranted lets the caller refresh the quotation
 * detail (balance, canRecordPayment/canGrantPaymentExemption) after commit.
 */
export function PaymentExemptionDialog({
  orderId,
  orderNumber,
  customerName,
  balanceDue,
  onGranted,
}: {
  orderId: string;
  orderNumber: string;
  customerName: string;
  balanceDue: number;
  onGranted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [exemptedBy, setExemptedBy] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setExemptedBy("");
    setReason("");
    setConfirmed(false);
    setError(undefined);
  }

  async function handleSubmit() {
    if (!exemptedBy.trim() || !reason.trim()) {
      setError("Enter who authorized the exemption and a reason.");
      return;
    }
    if (!confirmed) {
      setError("Please confirm this exemption before submitting.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    const result = await grantPaymentExemptionAction(orderId, exemptedBy.trim(), reason.trim());
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    reset();
    onGranted();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Payment Exemption
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Payment Exemption</h2>
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

              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <p>
                  <span className="text-slate-500">Order: </span>
                  <span className="font-medium text-slate-900">{orderNumber}</span>
                </p>
                <p>
                  <span className="text-slate-500">Customer: </span>
                  <span className="font-medium text-slate-900">{customerName}</span>
                </p>
                <p>
                  <span className="text-slate-500">Outstanding balance: </span>
                  <span className="font-medium text-slate-900">{formatCurrency(balanceDue)}</span>
                </p>
              </div>

              <Alert tone="info">
                This waives the required partial payment for production/operational eligibility only. It does NOT
                record a payment or mark this order as paid — the balance above remains due.
              </Alert>

              <div>
                <Label htmlFor="pe-by">Authorized by</Label>
                <Input
                  id="pe-by"
                  value={exemptedBy}
                  onChange={(e) => setExemptedBy(e.target.value)}
                  placeholder="Name of approving manager"
                />
              </div>
              <div>
                <Label htmlFor="pe-reason">Reason</Label>
                <Textarea
                  id="pe-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Government project, approved company account"
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                I confirm this customer is authorized to skip the required partial payment.
              </label>

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
                <Button type="button" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Granting..." : "Grant Exemption"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
