"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PaymentForm } from "./payment-form";

type Order = { id: string; orderNumber: string; customerName: string };

/**
 * Replaces the old permanent "Record a payment" Card that used to sit
 * beside the payments table (spec: "no giant permanent form beside the
 * table"). Same modal shell as app/(app)/orders/[id]/record-payment-dialog.tsx
 * (fixed overlay, centered white card, header+close, footer actions) —
 * that dialog is order-scoped (fixed orderId, shows balance context) so it
 * isn't reused verbatim here, but the actual form fields all live in the
 * one shared PaymentForm component, not duplicated into this file.
 */
export function RecordPaymentModal({ orders, defaultOrderId }: { orders: Order[]; defaultOrderId?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        + Record Payment
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Record Payment</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <PaymentForm
                orders={orders}
                defaultOrderId={defaultOrderId}
                redirectTo="/payments"
                submitLabel="Record Payment"
                onCancel={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
