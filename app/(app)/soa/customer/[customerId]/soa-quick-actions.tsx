"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Clock3, Eye, Download, Send, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentForm } from "@/app/(app)/payments/payment-form";
import { HistoricalPaymentForm } from "@/app/(app)/payments/historical-payment-form";
import { recordPaymentInPlaceAction } from "@/app/actions/payments";
import { startCustomerConversationAction } from "@/app/actions/messages";
import { SoaRangePreviewModal } from "./soa-range-preview-modal";
import { SoaPdfModal } from "./soa-pdf-modal";
import { SoaSendModal } from "./soa-send-modal";
import type { OrderSearchResult } from "@/app/actions/order-search";
import type { SoaDateRangeValue } from "./soa-filters";

/**
 * SOA dashboard's Quick Actions panel (SOA UI/UX improvement, Sept 3) —
 * every action opens the EXISTING form/workflow as a pop-up instead of
 * navigating away. Record Payment/Record Old Payment reuse
 * PaymentForm/HistoricalPaymentForm verbatim (same components the
 * Payments page and the Dashboard's Receivable Details modal already
 * use) with the same fixed-overlay modal shell as
 * app/(app)/payments/record-payment-modal.tsx — the styling/behavior
 * authority named explicitly, not the attached illustration. View/Print
 * SOA, Save as PDF, Send SOA, and Customer Transaction History are their
 * own small modals (soa-range-preview-modal/soa-pdf-modal/soa-send-modal)
 * that all resolve to the SAME generateStatementForRangeAction /
 * previewStatementOfAccountAction — never a parallel calculation.
 * `router.refresh()` on success re-fetches this Server Component page's
 * data (Financial Summary/Account Balance/Transaction History) without a
 * full browser reload, satisfying "SOA updates immediately."
 */
export function SoaQuickActions({
  customerId,
  customerName,
  customerEmail,
  hasLogin,
  defaultOrder,
  currentRange,
  currentFrom,
  currentTo,
  canRecord,
  canRecordHistorical,
  canShare,
  canGenerate,
  canMessage,
}: {
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  hasLogin: boolean;
  defaultOrder: OrderSearchResult | null;
  currentRange: SoaDateRangeValue;
  currentFrom: string;
  currentTo: string;
  canRecord: boolean;
  canRecordHistorical: boolean;
  canShare: boolean;
  canGenerate: boolean;
  canMessage: boolean;
}) {
  const router = useRouter();
  const [recordOpen, setRecordOpen] = useState(false);
  const [historicalOpen, setHistoricalOpen] = useState(false);
  const [messaging, setMessaging] = useState(false);

  async function handleMessage() {
    setMessaging(true);
    try {
      const { id } = await startCustomerConversationAction(customerId);
      window.dispatchEvent(new CustomEvent("chatbox:open-conversation", { detail: { conversationId: id } }));
    } finally {
      setMessaging(false);
    }
  }

  return (
    <div className="space-y-2">
      {canRecord && (
        <Button type="button" className="w-full justify-start" onClick={() => setRecordOpen(true)}>
          <CreditCard className="h-4 w-4" /> Record Payment
        </Button>
      )}
      {canRecordHistorical && (
        <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setHistoricalOpen(true)}>
          <Clock3 className="h-4 w-4" /> Record Old Payment
        </Button>
      )}

      {canGenerate && (
        <SoaRangePreviewModal
          customerId={customerId}
          buttonLabel="View / Print SOA"
          buttonIcon={Eye}
          title="View / Print SOA"
          subtitle="Generate and view the Statement of Account."
          allowPdf
          initialRange={currentRange}
          initialFrom={currentFrom}
          initialTo={currentTo}
        />
      )}

      {canGenerate && (
        <SoaPdfModal customerId={customerId} buttonIcon={Download} initialRange={currentRange} initialFrom={currentFrom} initialTo={currentTo} />
      )}

      {canShare && (
        <SoaSendModal
          customerId={customerId}
          customerEmail={customerEmail}
          hasLogin={hasLogin}
          buttonIcon={Send}
          initialRange={currentRange}
          initialFrom={currentFrom}
          initialTo={currentTo}
        />
      )}

      {canMessage && (
        <Button type="button" variant="outline" className="w-full justify-start" onClick={handleMessage} disabled={messaging}>
          {messaging ? "Opening…" : "Message"}
        </Button>
      )}

      <SoaRangePreviewModal
        customerId={customerId}
        buttonLabel="Customer Transaction History"
        buttonIcon={History}
        title="Customer Transaction History"
        subtitle="View this customer's full transaction history."
        allowPdf={false}
        initialRange="all"
        initialFrom=""
        initialTo=""
      />

      {recordOpen && (
        <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Record Payment</h2>
              <button type="button" onClick={() => setRecordOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <PaymentForm
                defaultOrder={defaultOrder}
                action={recordPaymentInPlaceAction}
                submitLabel="Record Payment"
                onCancel={() => setRecordOpen(false)}
                onSuccess={() => {
                  setRecordOpen(false);
                  router.refresh();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {historicalOpen && (
        <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Record Old Payment</h2>
                <p className="text-xs text-slate-500">Record a payment {customerName} already made but was never entered into LP System.</p>
              </div>
              <button type="button" onClick={() => setHistoricalOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <HistoricalPaymentForm
                defaultOrder={defaultOrder}
                onCancel={() => setHistoricalOpen(false)}
                onSuccess={() => {
                  setHistoricalOpen(false);
                  router.refresh();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
