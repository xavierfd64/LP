"use client";

import { useActionState, useMemo, useState } from "react";
import { uploadPaymentProofAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { EditorGrid, EditorPanel, TotalsPanel } from "@/components/documents/editor-shell";
import { formatCurrency, formatDate } from "@/lib/utils";

export type PayableOrder = { id: string; orderNumber: string; total: number; paid: number; balance: number };
type RecentPayment = {
  id: string;
  orderNumber: string;
  amount: number;
  method: string;
  referenceNumber: string | null;
  status: string;
  paymentDate: string;
};

export function CustomerPaymentForm({
  orders,
  defaultOrderId,
  recentPayments,
}: {
  orders: PayableOrder[];
  defaultOrderId?: string;
  recentPayments: RecentPayment[];
}) {
  const [error, formAction, pending] = useActionState(uploadPaymentProofAction, undefined);
  const payableOrders = orders.filter((o) => o.balance > 0);
  const initial = payableOrders.find((o) => o.id === defaultOrderId) ?? payableOrders[0];
  const [orderId, setOrderId] = useState(initial?.id ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.balance) : "");

  const selected = useMemo(() => orders.find((o) => o.id === orderId), [orders, orderId]);
  const amountNum = Number(amount) || 0;
  const newBalance = selected ? Math.max(selected.balance - amountNum, 0) : 0;

  if (payableOrders.length === 0) {
    return (
      <EditorPanel title="Payment Information">
        <EmptyState label="You have no outstanding balance to pay right now." />
      </EditorPanel>
    );
  }

  return (
    <>
      <EditorGrid>
        <EditorPanel title="Payment Information">
          <form action={formAction} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <input type="hidden" name="redirectTo" value="/payments/pay?success=1" />
            <div>
              <Label htmlFor="orderId">Paying For (Invoice / Order)</Label>
              <Select
                id="orderId"
                name="orderId"
                required
                value={orderId}
                onChange={(e) => {
                  const o = orders.find((x) => x.id === e.target.value);
                  setOrderId(e.target.value);
                  setAmount(o ? String(o.balance) : "");
                }}
              >
                {payableOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} — Balance {formatCurrency(o.balance)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="amount">Payment Amount</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min={0.01}
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-brand-700">Payment Details</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="method">Payment Method</Label>
                <Select id="method" name="method" defaultValue="GCASH" required>
                  <option value="GCASH">GCash</option>
                  <option value="MAYA">Maya</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="OTHER">Other</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="paymentDate">Payment Date</Label>
                <Input id="paymentDate" name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="referenceNumber">Reference / Transaction No.</Label>
                <Input id="referenceNumber" name="referenceNumber" placeholder="e.g. GC-20260819-00123" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" rows={2} placeholder="Anything we should know about this payment…" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="proofFile">Upload Payment Proof</Label>
                <input id="proofFile" name="proofFile" type="file" required accept="image/*,application/pdf" className="block w-full text-sm text-slate-600" />
                <p className="mt-1 text-xs text-slate-400">A screenshot or receipt of your GCash/Maya/bank transfer.</p>
              </div>
            </div>

            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Submitting…" : "Submit Payment"}
            </Button>
          </form>
        </EditorPanel>

        <EditorPanel title="Payment Summary">
          {selected && (
            <TotalsPanel
              rows={[
                { label: "Invoice Amount", value: formatCurrency(selected.total) },
                { label: "Amount Paid", value: formatCurrency(selected.paid) },
                { label: "Outstanding", value: formatCurrency(selected.balance) },
                { label: "Payment Amount", value: formatCurrency(amountNum) },
              ]}
              total={{ label: "New Balance", value: formatCurrency(newBalance) }}
            />
          )}
        </EditorPanel>
      </EditorGrid>

      <EditorPanel title="Recent Payments">
        <div className="hidden sm:block">
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Order</TH>
                <TH>Amount</TH>
                <TH>Method</TH>
                <TH>Reference</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {recentPayments.map((p) => (
                <TR key={p.id}>
                  <TD>{formatDate(p.paymentDate)}</TD>
                  <TD className="font-medium text-slate-900">{p.orderNumber}</TD>
                  <TD>{formatCurrency(p.amount)}</TD>
                  <TD>{p.method.replace(/_/g, " ")}</TD>
                  <TD>{p.referenceNumber ?? "—"}</TD>
                  <TD>
                    <StatusBadge status={p.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        <div className="space-y-3 sm:hidden">
          {recentPayments.map((p) => (
            <div key={p.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{p.orderNumber}</p>
                <StatusBadge status={p.status} />
              </div>
              <p className="mt-1 text-sm text-slate-600">{formatCurrency(p.amount)} · {p.method.replace(/_/g, " ")}</p>
              <p className="text-xs text-slate-400">{formatDate(p.paymentDate)} {p.referenceNumber ? `· ${p.referenceNumber}` : ""}</p>
            </div>
          ))}
        </div>
        {recentPayments.length === 0 && <EmptyState label="No payments recorded yet." />}
      </EditorPanel>
    </>
  );
}
