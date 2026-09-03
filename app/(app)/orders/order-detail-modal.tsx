"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { InfoField, TotalsPanel } from "@/components/documents/editor-shell";
import { LineItemsView } from "@/components/documents/line-items-view";
import { Alert } from "@/components/ui/alert";
import { RecordPaymentDialog } from "./[id]/record-payment-dialog";
import { getOrderDetailAction, type OrderDetailResult } from "@/app/actions/order-detail";
import { formatCurrency, formatDate } from "@/lib/utils";

type Detail = Extract<OrderDetailResult, { ok: true }>["data"];

/**
 * Replaces navigating to /orders/[id] when "View" is clicked from the
 * staff/admin Orders list (Aug 22 UI redesign update 2, Part 4/7). Order
 * items mirror the exact derivation the Invoice print view already uses
 * (quotation line items, else a single summary line) — see
 * app/actions/order-detail.ts. "Record Payment" reuses the existing
 * RecordPaymentDialog component verbatim rather than a second payment
 * form, so every existing payment security check still applies unchanged.
 */
export function OrderDetailModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrderDetailAction(orderId).then((res) => {
      if (res.ok) setDetail(res.data);
      else setError(res.error);
      setLoading(false);
    });
  }, [orderId]);

  return (
    <Modal open onClose={onClose} maxWidthClassName="max-w-3xl">
      <ModalHeader
        title={<>Order Details {detail && <span className="font-normal text-slate-500">{detail.orderNumber}</span>}</>}
        badge={
          detail && (
            <div className="flex items-center gap-1.5">
              <StatusBadge status={detail.status} />
              {detail.isHistorical && (
                <Badge tone="yellow">{detail.historicalOrderType === "ALREADY_RELEASED" ? "Released (Historical)" : "Historical"}</Badge>
              )}
            </div>
          )
        }
        onClose={onClose}
      />
      <ModalBody>
        {loading && <p className="py-6 text-center text-sm text-slate-400">Loading…</p>}
        {error && <Alert tone="error">{error}</Alert>}
        {detail && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <InfoField label="Customer" value={detail.customerName} />
              <InfoField label="Payment Terms" value={detail.paymentTermType.replace(/_/g, " ")} />
              <InfoField label="Due Date" value={detail.dueDate ? formatDate(detail.dueDate) : "—"} />
              <InfoField label="Order Date" value={formatDate(detail.orderDate)} />
            </div>

            {detail.isHistorical && (
              <Alert tone="info">
                This order was encoded via Historical Transaction Encoding
                {detail.historicalOrderType === "ALREADY_RELEASED"
                  ? " as already released — it did not go through production."
                  : " — it still goes through the normal production workflow."}
                {detail.historicalNotes && <span className="block mt-1 text-slate-600">{detail.historicalNotes}</span>}
              </Alert>
            )}

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-700">Order Items</h3>
              <LineItemsView items={detail.items} />
              <TotalsPanel
                rows={[
                  { label: "Amount Paid", value: formatCurrency(detail.confirmedPaid) },
                  { label: "Balance Due", value: formatCurrency(detail.balanceDue), muted: Number(detail.balanceDue) <= 0 },
                ]}
                total={{ label: "Grand Total", value: formatCurrency(detail.totalAmount) }}
              />
            </section>

            {detail.jobOrders.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-700">Job Orders</h3>
                <div className="space-y-1.5">
                  {detail.jobOrders.map((jo) => (
                    <div key={jo.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm">
                      <span className="font-medium text-slate-900">{jo.joNumber}</span>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={jo.status} />
                        <Link href={`/job-orders/${jo.id}`} className="text-sm font-medium text-brand-600 underline">
                          View
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {detail.notes && (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-700">Notes / Requirements</h3>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{detail.notes}</p>
              </section>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        {detail && (
          <Link href={`/orders/${detail.id}/invoice`} target="_blank">
            <Button type="button" variant="outline">
              Print / Download
            </Button>
          </Link>
        )}
        {detail?.canRecordPayment && (
          <RecordPaymentDialog
            orderId={detail.id}
            orderNumber={detail.orderNumber}
            customerName={detail.customerName}
            balanceDue={Number(detail.balanceDue)}
          />
        )}
      </ModalFooter>
    </Modal>
  );
}
