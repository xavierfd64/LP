"use client";

import { useActionState } from "react";
import { recordPaymentAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type Order = { id: string; orderNumber: string; customerName: string };

export function PaymentForm({ orders }: { orders: Order[] }) {
  const [error, formAction, pending] = useActionState(recordPaymentAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="orderId">Order</Label>
        <Select id="orderId" name="orderId" required>
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
        <Label htmlFor="method">Method</Label>
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
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Recording..." : "Record Payment (Confirmed)"}
      </Button>
    </form>
  );
}
