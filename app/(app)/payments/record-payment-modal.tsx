"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { PaymentForm } from "./payment-form";
import { HistoricalPaymentForm } from "./historical-payment-form";
import type { OrderSearchResult } from "@/app/actions/order-search";

/**
 * "+ Record Payment" — a plain button, or a split/dropdown ("Record
 * Payment" / "Record Old Payment") when the signed-in user also holds
 * PAYMENT_BACKDATE (Historical Transaction Encoding, Sept 3). Same modal
 * shell as app/(app)/orders/[id]/record-payment-dialog.tsx (fixed overlay,
 * centered white card, header+close) — the actual form fields live in
 * PaymentForm / HistoricalPaymentForm, not duplicated here.
 */
export function RecordPaymentModal({
  defaultOrder,
  canRecord = true,
  canRecordHistorical = false,
}: {
  defaultOrder?: OrderSearchResult | null;
  canRecord?: boolean;
  canRecordHistorical?: boolean;
}) {
  const router = useRouter();
  const [normalOpen, setNormalOpen] = useState(false);
  const [historicalOpen, setHistoricalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  if (!canRecord && !canRecordHistorical) return null;

  return (
    <>
      {!canRecord && canRecordHistorical ? (
        <Button type="button" onClick={() => setHistoricalOpen(true)}>
          + Record Old Payment
        </Button>
      ) : !canRecordHistorical ? (
        <Button type="button" onClick={() => setNormalOpen(true)}>
          + Record Payment
        </Button>
      ) : (
        <div ref={ref} className="relative">
          <Button type="button" onClick={() => setMenuOpen((o) => !o)}>
            + Record Payment <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {menuOpen && (
            <div className="absolute right-0 z-30 mt-1 w-52 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setNormalOpen(true);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                Record Payment
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setHistoricalOpen(true);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                Record Old Payment
              </button>
            </div>
          )}
        </div>
      )}

      <Modal open={normalOpen} onClose={() => setNormalOpen(false)} maxWidthClassName="max-w-2xl">
        <ModalHeader icon={<Wallet className="h-5 w-5" />} title="Record Payment" onClose={() => setNormalOpen(false)} />
        <ModalBody>
          <PaymentForm
            defaultOrder={defaultOrder}
            redirectTo="/payments"
            submitLabel="Record Payment"
            onCancel={() => setNormalOpen(false)}
          />
        </ModalBody>
      </Modal>

      <Modal open={historicalOpen} onClose={() => setHistoricalOpen(false)} maxWidthClassName="max-w-2xl">
        <ModalHeader
          icon={<Wallet className="h-5 w-5" />}
          title="Record Old Payment"
          subtitle="Record a payment the customer already made but was never entered into LP System."
          onClose={() => setHistoricalOpen(false)}
        />
        <ModalBody>
          <HistoricalPaymentForm
            defaultOrder={defaultOrder}
            onCancel={() => setHistoricalOpen(false)}
            onSuccess={() => {
              setHistoricalOpen(false);
              router.refresh();
            }}
          />
        </ModalBody>
      </Modal>
    </>
  );
}
