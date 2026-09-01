"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { getReceivableDetailsAction } from "@/app/actions/dashboard";
import { startCustomerConversationAction } from "@/app/actions/messages";
import { recordPaymentInPlaceAction } from "@/app/actions/payments";
import { PaymentForm } from "@/app/(app)/payments/payment-form";
import type { ReceivableDetails } from "@/lib/dashboard-data";
import type { OrderSearchResult } from "@/app/actions/order-search";

const TX_STATUS_TONE = { UNPAID: "yellow", PARTIALLY_PAID: "blue", OVERDUE: "red" } as const;
const PAYMENT_STATUS_TONE: Record<string, "green" | "yellow" | "red"> = { CONFIRMED: "green", PENDING: "yellow", REJECTED: "red" };

/**
 * Receivables "View" trigger + drill-down modal (9th update). Self-contained
 * per row — same pattern as MessengerDispatchDialog on the Kanban — so it
 * fetches the moment it opens rather than pre-loading every row's detail
 * up front. Answers "why is this customer on the Receivables list" with
 * the actual transactions responsible, never the general Customer Profile.
 */
export function ReceivableDetailsModal({
  customerId,
  canMessage,
  canRecordPayment,
}: {
  customerId: string;
  canMessage: boolean;
  canRecordPayment: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReceivableDetails | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  // A payment recorded during this viewing that hasn't yet been reflected
  // on the Dashboard behind this dialog — see closeDetails() below for why
  // that refresh is deliberately deferred rather than fired immediately.
  const [dashboardStale, setDashboardStale] = useState(false);

  async function loadDetails() {
    try {
      const result = await getReceivableDetailsAction(customerId);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load receivable details.");
    }
  }

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError(null);
    await loadDetails();
    setLoading(false);
  }

  /**
   * After a successful in-place payment: refresh this modal's own data
   * (Recent Payments / Outstanding Balance) immediately, per the standing
   * "no manual refresh" requirement. The Dashboard's own Receivables list
   * behind this dialog is intentionally NOT refreshed here — this row
   * (this exact customerId) is what the whole modal tree, including this
   * component instance, is mounted under in ReceivablesList; if this
   * payment clears the balance, an immediate router.refresh() would remove
   * the row (and this component along with it) while the dialog the user
   * is still looking at is open, yanking it away mid-view. Deferred to
   * closeDetails() instead, so it happens the moment it's actually safe to.
   */
  async function handlePaymentSuccess() {
    setPaymentOpen(false);
    await loadDetails();
    setDashboardStale(true);
  }

  function closeDetails() {
    setOpen(false);
    if (dashboardStale) {
      router.refresh();
      setDashboardStale(false);
    }
  }

  async function handleMessage() {
    setMessaging(true);
    try {
      const { id } = await startCustomerConversationAction(customerId);
      setOpen(false);
      window.dispatchEvent(new CustomEvent("chatbox:open-conversation", { detail: { conversationId: id } }));
    } finally {
      setMessaging(false);
    }
  }

  // A single open transaction preselects the payment form's Order combobox
  // so staff never has to re-search for someone already on this screen;
  // with more than one, leave it undefined so the combobox works exactly
  // like the standalone /payments page does today.
  const defaultOrder: OrderSearchResult | null =
    data && data.transactions.length === 1
      ? {
          id: data.transactions[0].id,
          orderNumber: data.transactions[0].reference,
          customerName: data.customer.name,
          customerPhone: data.customer.contactNumber,
          quoteNumber: null,
        }
      : null;

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleOpen}>
        View
      </Button>

      {open && (
        <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="flex h-full w-full flex-col bg-white shadow-xl sm:h-auto sm:max-h-[90dvh] sm:max-w-4xl sm:rounded-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Receivable Details</p>
                <p className="text-xs text-slate-400">Why this customer needs attention</p>
              </div>
              <button
                type="button"
                onClick={closeDetails}
                aria-label="Close"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {loading && (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              {data && !loading && (
                <>
                  <div className="rounded-lg border border-slate-100 p-3">
                    <p className="font-semibold text-slate-900">{data.customer.name}</p>
                    <p className="text-xs text-slate-400">{data.customer.displayId}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {data.customer.contactNumber && <span>{data.customer.contactNumber}</span>}
                      {data.customer.email && <span>{data.customer.email}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <SummaryTile label="Total Outstanding" value={formatCurrency(data.totalOutstanding)} emphasize />
                    <SummaryTile label="Current" value={formatCurrency(data.current)} />
                    <SummaryTile label="Due" value={formatCurrency(data.due)} tone={data.due > 0 ? "yellow" : undefined} />
                    <SummaryTile label="Overdue" value={formatCurrency(data.overdue)} tone={data.overdue > 0 ? "red" : undefined} />
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Transactions Requiring Attention</p>
                    <div className="overflow-x-auto rounded-md border border-slate-100">
                      <Table>
                        <THead>
                          <TR>
                            <TH>Transaction</TH>
                            <TH>Reference</TH>
                            <TH>Date</TH>
                            <TH>Due Date</TH>
                            <TH className="text-right">Total</TH>
                            <TH className="text-right">Paid</TH>
                            <TH className="text-right">Outstanding</TH>
                            <TH>Status</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {data.transactions.map((t) => (
                            <TR key={t.id}>
                              <TD className="whitespace-nowrap text-sm">{t.type}</TD>
                              <TD>
                                <Link href={t.href} className="text-sm font-medium text-slate-900 underline">
                                  {t.reference}
                                </Link>
                              </TD>
                              <TD className="whitespace-nowrap text-sm text-slate-500">{formatDate(t.date)}</TD>
                              <TD className="whitespace-nowrap text-sm text-slate-500">{t.dueDate ? formatDate(t.dueDate) : "—"}</TD>
                              <TD className="text-right text-sm">{formatCurrency(t.total)}</TD>
                              <TD className="text-right text-sm">{formatCurrency(t.paid)}</TD>
                              <TD className="text-right text-sm font-medium text-slate-900">{formatCurrency(t.outstanding)}</TD>
                              <TD>
                                <Badge tone={TX_STATUS_TONE[t.status]}>{t.status.replace(/_/g, " ")}</Badge>
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                      {data.transactions.length === 0 && <EmptyState label="No open transactions found." />}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Payments</p>
                    {data.recentPayments.length === 0 ? (
                      <p className="text-sm text-slate-400">No payments recorded yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {data.recentPayments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm">
                            <div>
                              <p className="font-medium text-slate-900">{p.reference}</p>
                              <p className="text-xs text-slate-400">
                                {formatDate(p.date)} · {p.method.replace(/_/g, " ")}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-700">{formatCurrency(p.amount)}</p>
                              <Badge tone={PAYMENT_STATUS_TONE[p.status] ?? "yellow"}>{p.status}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <Link href={`/soa/customer/${customerId}`}>
                <Button type="button" variant="outline" size="sm">
                  View SOA
                </Button>
              </Link>
              {canMessage && (
                <Button type="button" variant="outline" size="sm" onClick={handleMessage} disabled={messaging}>
                  {messaging ? "Opening..." : "Message"}
                </Button>
              )}
              {canRecordPayment && (
                <Button type="button" size="sm" onClick={() => setPaymentOpen(true)} disabled={loading || !data}>
                  Record Payment
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={closeDetails}>
                Close
              </Button>
            </div>
          </div>

          {paymentOpen && data && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto rounded-lg bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Record Payment</p>
                    <p className="truncate text-xs text-slate-400">
                      {data.customer.name} · {formatCurrency(data.totalOutstanding)} outstanding
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaymentOpen(false)}
                    aria-label="Close"
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-5">
                  <PaymentForm
                    defaultOrder={defaultOrder}
                    action={recordPaymentInPlaceAction}
                    onSuccess={handlePaymentSuccess}
                    onCancel={() => setPaymentOpen(false)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  emphasize,
}: {
  label: string;
  value: string;
  tone?: "yellow" | "red";
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-2.5",
        tone === "red" ? "border-red-200 bg-red-50" : tone === "yellow" ? "border-yellow-200 bg-yellow-50" : "border-slate-100"
      )}
    >
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("font-semibold", emphasize ? "text-lg text-slate-900" : "text-sm text-slate-700")}>{value}</p>
    </div>
  );
}
