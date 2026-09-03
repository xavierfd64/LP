"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PaymentForm } from "@/app/(app)/payments/payment-form";
import { HistoricalPaymentForm } from "@/app/(app)/payments/historical-payment-form";
import { recordPaymentInPlaceAction } from "@/app/actions/payments";
import { sendStatementEmailAction } from "@/app/actions/soa";
import { startCustomerConversationAction } from "@/app/actions/messages";
import type { OrderSearchResult } from "@/app/actions/order-search";

/**
 * SOA dashboard's Quick Actions panel (SOA UI/UX improvement, Sept 3) —
 * every action opens the EXISTING form/workflow as a pop-up instead of
 * navigating away, per the spec's explicit requirement. The two payment
 * modals reuse PaymentForm/HistoricalPaymentForm verbatim (same components
 * the Payments page and the Dashboard's Receivable Details modal already
 * use) with the same fixed-overlay modal shell as
 * app/(app)/payments/record-payment-modal.tsx — the styling/behavior
 * authority the spec names explicitly, not the attached illustration.
 * `router.refresh()` on success re-fetches this Server Component page's
 * data (Financial Summary/Account Balance/Transaction History) without a
 * full browser reload, satisfying "SOA updates immediately."
 */
export function SoaQuickActions({
  customerId,
  customerName,
  defaultOrder,
  latestStatementId,
  canRecord,
  canRecordHistorical,
  canShare,
  canMessage,
}: {
  customerId: string;
  customerName: string;
  defaultOrder: OrderSearchResult | null;
  latestStatementId: string | null;
  canRecord: boolean;
  canRecordHistorical: boolean;
  canShare: boolean;
  canMessage: boolean;
}) {
  const router = useRouter();
  const [recordOpen, setRecordOpen] = useState(false);
  const [historicalOpen, setHistoricalOpen] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleMessage() {
    setMessaging(true);
    try {
      const { id } = await startCustomerConversationAction(customerId);
      window.dispatchEvent(new CustomEvent("chatbox:open-conversation", { detail: { conversationId: id } }));
    } finally {
      setMessaging(false);
    }
  }

  async function handleSend() {
    if (!latestStatementId) return;
    setSending(true);
    await sendStatementEmailAction(latestStatementId);
    setSending(false);
    setSent(true);
  }

  return (
    <div className="space-y-2">
      {canRecord && (
        <Button type="button" className="w-full justify-start" onClick={() => setRecordOpen(true)}>
          Record Payment
        </Button>
      )}
      {canRecordHistorical && (
        <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setHistoricalOpen(true)}>
          Record Old Payment
        </Button>
      )}

      {latestStatementId ? (
        <Link href={`/soa/view/${latestStatementId}`} target="_blank" className="block">
          <Button type="button" variant="outline" className="w-full justify-start">
            View / Print SOA
          </Button>
        </Link>
      ) : (
        <Button type="button" variant="outline" className="w-full justify-start" disabled title="Generate a statement first">
          View / Print SOA
        </Button>
      )}

      {latestStatementId ? (
        <Link href={`/soa/${latestStatementId}/print`} target="_blank" className="block">
          <Button type="button" variant="outline" className="w-full justify-start">
            Save as PDF
          </Button>
        </Link>
      ) : (
        <Button type="button" variant="outline" className="w-full justify-start" disabled title="Generate a statement first">
          Save as PDF
        </Button>
      )}

      {canShare &&
        (latestStatementId ? (
          <Button type="button" variant="outline" className="w-full justify-start" onClick={handleSend} disabled={sending}>
            {sending ? "Sending…" : "Send SOA to Customer"}
          </Button>
        ) : (
          <Button type="button" variant="outline" className="w-full justify-start" disabled title="Generate a statement first">
            Send SOA to Customer
          </Button>
        ))}
      {sent && <Alert tone="success">Queued — check the Email Log for delivery status.</Alert>}

      {canMessage && (
        <Button type="button" variant="outline" className="w-full justify-start" onClick={handleMessage} disabled={messaging}>
          {messaging ? "Opening…" : "Message"}
        </Button>
      )}

      <Link href={`/customers/${customerId}`} className="block">
        <Button type="button" variant="outline" className="w-full justify-start">
          Customer Transaction History
        </Button>
      </Link>

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
