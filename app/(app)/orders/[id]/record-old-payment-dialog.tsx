"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HistoricalPaymentForm } from "../../payments/historical-payment-form";
import type { OrderSearchResult } from "@/app/actions/order-search";

/**
 * Order-scoped "Record Old Payment" (Historical Transaction Encoding, Sept
 * 3, Part 9's "also accessible from... order... screens if it fits") — the
 * natural next step right after encoding an old order (Part 17's combined
 * scenario), instead of making staff navigate away to the Payments page.
 * Reuses HistoricalPaymentForm verbatim, preselected to this order.
 */
export function RecordOldPaymentDialog({ defaultOrder }: { defaultOrder: OrderSearchResult }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Record Old Payment
      </Button>

      {open && (
        <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Record Old Payment</h2>
                <p className="text-xs text-slate-500">Record a payment already made on this order but never entered into LP System.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <HistoricalPaymentForm
                defaultOrder={defaultOrder}
                onCancel={() => setOpen(false)}
                onSuccess={() => {
                  setOpen(false);
                  router.refresh();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
