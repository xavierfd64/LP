"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { recordHistoricalPaymentAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { OrderCombobox } from "./order-combobox";
import type { OrderSearchResult } from "@/app/actions/order-search";
import { BalancePreviewPanel, useOrderBalance } from "@/components/payments/balance-preview-panel";

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
  const balance = useOrderBalance(orderId);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !error) onSuccess?.();
    wasPending.current = pending;
  }, [pending, error, onSuccess]);

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

        <BalancePreviewPanel
          orderId={orderId}
          amount={amount}
          balance={balance}
          infoText="Payment Date is the actual date when the customer paid. This payment will affect receivables and SOA based on the payment date."
        />
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
