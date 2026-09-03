"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { recordHistoricalPaymentAction } from "@/app/actions/payments";
import { getOrderBalanceAction, type OrderBalanceResult } from "@/app/actions/order-search";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { OrderCombobox } from "./order-combobox";
import type { OrderSearchResult } from "@/app/actions/order-search";
import { formatCurrency } from "@/lib/utils";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Record Old Payment (Historical Transaction Encoding, Sept 3) — the
 * controlled counterpart to PaymentForm for a payment the customer already
 * made but that was never entered at the time. Distinct from PaymentForm
 * (rather than reusing it directly) because the mockup calls for the live
 * Order Total / Total Paid (Before) / This Payment / Total Paid (After) /
 * Balance panel, which the normal form has no need for — everything else
 * (OrderCombobox, method/reference/notes fields) is the same building
 * block. Actual Payment Date is required here (normal Record Payment
 * leaves it optional), matching recordHistoricalPaymentAction's validation.
 */
export function HistoricalPaymentForm({
  defaultOrder,
  onCancel,
  onSuccess,
}: {
  defaultOrder?: OrderSearchResult | null;
  onCancel?: () => void;
  onSuccess?: () => void;
}) {
  const [error, formAction, pending] = useActionState(recordHistoricalPaymentAction, undefined);
  const [orderId, setOrderId] = useState(defaultOrder?.id ?? "");
  const [amount, setAmount] = useState<number>(0);
  const [balance, setBalance] = useState<OrderBalanceResult | null>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !error) onSuccess?.();
    wasPending.current = pending;
  }, [pending, error, onSuccess]);

  useEffect(() => {
    if (!orderId) {
      setBalance(null);
      return;
    }
    getOrderBalanceAction(orderId).then(setBalance);
  }, [orderId]);

  const totalPaidBefore = balance?.ok ? balance.confirmedPaid : 0;
  const orderTotal = balance?.ok ? balance.total : 0;
  const totalPaidAfter = totalPaidBefore + (amount || 0);
  const balanceAfter = Math.max(orderTotal - totalPaidAfter, 0);

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <div>
            <Label htmlFor="historicalOrderId">Related Order / Invoice</Label>
            <OrderCombobox name="orderId" defaultOrder={defaultOrder} onSelectionChange={setOrderId} />
          </div>
          <div>
            <Label htmlFor="historicalPaymentDate">Actual Payment Date</Label>
            <Input id="historicalPaymentDate" name="paymentDate" type="date" required max={today()} defaultValue={today()} />
          </div>
          <div>
            <Label htmlFor="historicalAmount">Amount (PHP)</Label>
            <Input
              id="historicalAmount"
              name="amount"
              type="number"
              min={0.01}
              step="0.01"
              required
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="historicalMethod">Payment Method</Label>
            <Select id="historicalMethod" name="method" defaultValue="CASH">
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="GCASH">GCash</option>
              <option value="MAYA">Maya</option>
              <option value="CHEQUE">Cheque</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="historicalReferenceNumber">Reference Number (optional)</Label>
            <Input id="historicalReferenceNumber" name="referenceNumber" placeholder="e.g. GCash ref #, Check #, Bank Ref #" />
          </div>
          <div>
            <Label htmlFor="historicalPaymentNotes">Notes (optional)</Label>
            <Textarea id="historicalPaymentNotes" name="notes" rows={2} placeholder="Why this payment is being encoded historically..." />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Balance Preview</p>
          {!orderId ? (
            <p className="text-sm text-slate-400">Select an order to see its balance.</p>
          ) : !balance ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : !balance.ok ? (
            <p className="text-sm text-red-600">{balance.error}</p>
          ) : (
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Order Total</dt>
                <dd className="font-medium text-slate-900">{formatCurrency(orderTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Total Paid (Before)</dt>
                <dd className="font-medium text-slate-900">{formatCurrency(totalPaidBefore)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">This Payment</dt>
                <dd className="font-medium text-slate-900">{formatCurrency(amount || 0)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5">
                <dt className="text-slate-500">Total Paid (After)</dt>
                <dd className="font-medium text-slate-900">{formatCurrency(totalPaidAfter)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Balance</dt>
                <dd className={`font-semibold ${balanceAfter > 0 ? "text-yellow-700" : "text-green-700"}`}>{formatCurrency(balanceAfter)}</dd>
              </div>
            </dl>
          )}
          <Alert tone="info" className="text-xs">
            Payment Date is the actual date when the customer paid. This payment will affect receivables and SOA based on the payment date.
          </Alert>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending || !orderId} className={onCancel ? undefined : "w-full sm:w-auto"}>
          {pending ? "Saving..." : "Save Payment"}
        </Button>
      </div>
    </form>
  );
}
