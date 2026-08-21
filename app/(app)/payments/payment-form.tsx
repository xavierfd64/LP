"use client";

import { useActionState } from "react";
import { recordPaymentAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type Order = { id: string; orderNumber: string; customerName: string };

/**
 * Shared by the standalone Payments-page modal and (going forward) any
 * other embedding — `redirectTo` follows the exact same "caller says where
 * to land" pattern already used by uploadPaymentProofAction, defaulting to
 * the order detail page (recordPaymentAction's own fallback) when omitted.
 * `onCancel`/`submitLabel` are optional so this still renders standalone
 * (no cancel button, default label) if ever embedded without a modal shell.
 */
export function PaymentForm({
  orders,
  defaultOrderId,
  redirectTo,
  onCancel,
  submitLabel = "Record Payment (Confirmed)",
}: {
  orders: Order[];
  defaultOrderId?: string;
  redirectTo?: string;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [error, formAction, pending] = useActionState(recordPaymentAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="orderId">Order</Label>
        <Select id="orderId" name="orderId" required defaultValue={defaultOrderId ?? ""}>
          <option value="">Select an order...</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.orderNumber} — {o.customerName}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="amount">Amount (PHP)</Label>
        <Input id="amount" name="amount" type="number" min={0.01} step="0.01" required />
      </div>
      <div>
        <Label htmlFor="method">Payment method</Label>
        <Select id="method" name="method" defaultValue="CASH">
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank Transfer</option>
          <option value="GCASH">GCash</option>
          <option value="MAYA">Maya</option>
          <option value="CHEQUE">Cheque</option>
          <option value="OTHER">Other</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="referenceNumber">Reference Number (optional)</Label>
        <Input id="referenceNumber" name="referenceNumber" placeholder="e.g. GCash ref #, Check #, Bank Ref #" />
      </div>
      <div>
        <Label htmlFor="paymentDate">Payment Date</Label>
        <Input id="paymentDate" name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
      </div>
      <div>
        <Label htmlFor="proofFile">Payment Proof (optional)</Label>
        <input
          id="proofFile"
          name="proofFile"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-50"
        />
      </div>
      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={2} placeholder="Add any notes about this payment..." />
      </div>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending} className={onCancel ? undefined : "w-full sm:w-auto"}>
          {pending ? "Recording..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
