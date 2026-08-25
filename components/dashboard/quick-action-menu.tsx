"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewQuotationModal } from "@/app/(app)/quotations/new-quotation-modal";
import { NewOrderModal } from "@/app/(app)/orders/new-order-modal";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { PaymentForm } from "@/app/(app)/payments/payment-form";

export type QuickAction = { label: string; kind: "quotation" | "order" | "payment" };

/**
 * "+ New Transaction" (Aug 25 update 1) — every option now opens the
 * existing creation form as a dialogue box directly from the dashboard,
 * instead of navigating to /quotations/new, /orders/new, or /payments.
 * Reuses the exact same QuotationForm/OrderForm/PaymentForm components
 * (via the shared NewQuotationModal/NewOrderModal and the same
 * RecordPaymentModal-shaped shell) as their dedicated pages — no
 * duplicated form logic, just a different entry point. There's no
 * standalone "New Job Order" or "New Invoice" here — Job Orders are added
 * from within an Order, and an Invoice is the Order's own print view.
 */
export function QuickActionMenu({ actions, canSend }: { actions: QuickAction[]; canSend: boolean }) {
  const [open, setOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<QuickAction["kind"] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  if (actions.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <Button type="button" onClick={() => setOpen((o) => !o)}>
        <Plus className="h-4 w-4" /> New Transaction <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-52 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {actions.map((a) => (
            <button
              key={a.kind}
              type="button"
              onClick={() => {
                setOpen(false);
                setActiveModal(a.kind);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      <NewQuotationModal open={activeModal === "quotation"} onClose={() => setActiveModal(null)} canSend={canSend} />
      <NewOrderModal open={activeModal === "order"} onClose={() => setActiveModal(null)} />
      <Modal open={activeModal === "payment"} onClose={() => setActiveModal(null)} maxWidthClassName="max-w-md">
        <ModalHeader title="Record Payment" onClose={() => setActiveModal(null)} />
        <ModalBody>
          <PaymentForm redirectTo="/dashboard" submitLabel="Record Payment" onCancel={() => setActiveModal(null)} />
        </ModalBody>
      </Modal>
    </div>
  );
}
