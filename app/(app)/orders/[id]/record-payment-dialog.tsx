"use client";

import { useState } from "react";
import { useActionState } from "react";
import { recordPaymentAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";

export function RecordPaymentDialog({
  orderId,
  orderNumber,
  customerName,
  balanceDue,
}: {
  orderId: string;
  orderNumber: string;
  customerName: string;
  balanceDue: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, formAction, pending] = useActionState(recordPaymentAction, undefined);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Record a Payment
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Record a Payment</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form action={formAction} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <input type="hidden" name="orderId" value={orderId} />
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

              <div>
                <Label htmlFor="rp-amount">Amount paid (PHP)</Label>
                <Input
                  id="rp-amount"
                  name="amount"
                  type="number"
                  min={0.01}
                  step="0.01"
                  defaultValue={balanceDue > 0 ? balanceDue.toFixed(2) : undefined}
                  required
                />
              </div>
              <div>
                <Label htmlFor="rp-method">Payment method</Label>
                <Select id="rp-method" name="method" defaultValue="CASH">
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="GCASH">GCash</option>
                  <option value="MAYA">Maya</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="OTHER">Other</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="rp-reference">Reference number (optional)</Label>
                <Input id="rp-reference" name="referenceNumber" placeholder="e.g. GCash ref #" />
              </div>
              <div>
                <Label htmlFor="rp-date">Payment date</Label>
                <Input
                  id="rp-date"
                  name="paymentDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div>
                <Label htmlFor="rp-notes">Notes (optional)</Label>
                <Textarea id="rp-notes" name="notes" rows={2} />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Recording..." : "Record Payment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
