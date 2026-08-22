"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { InfoField, TotalsPanel } from "@/components/documents/editor-shell";
import { LineItemsView } from "@/components/documents/line-items-view";
import { Alert } from "@/components/ui/alert";
import { getQuotationDetailAction, type QuotationDetailResult } from "@/app/actions/quotation-detail";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

type Detail = Extract<QuotationDetailResult, { ok: true }>["data"];

/**
 * Replaces navigating to /quotations/[id] when "View" is clicked from the
 * staff/admin Quotations list (Aug 22 UI redesign update 2, Part 4/6).
 * Reuses the same LineItemsView/TotalsPanel the full detail page already
 * renders with, so the discount/tax/total figures shown here can never
 * drift from the full page's — this is a smaller read-only summary, not a
 * second calculation of anything. "Print / Download" opens the existing
 * print view exactly like the full page's own "View Document" button
 * does; "Convert to Order" is the existing /orders/new?quotationId= flow.
 */
export function QuotationDetailModal({ quotationId, onClose }: { quotationId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getQuotationDetailAction(quotationId).then((res) => {
      if (res.ok) setDetail(res.data);
      else setError(res.error);
      setLoading(false);
    });
  }, [quotationId]);

  const totalsRows =
    detail && detail.subtotal != null
      ? [
          { label: "Subtotal", value: formatCurrency(detail.subtotal) },
          ...(Number(detail.discountAmount) > 0
            ? [{ label: detail.discountLabel ?? "Discount", value: formatCurrency(detail.discountAmount), negative: true }]
            : []),
        ]
      : [];

  return (
    <Modal open onClose={onClose} maxWidthClassName="max-w-3xl">
      <ModalHeader
        title={<>Quotation Details {detail && <span className="font-normal text-slate-500">{detail.quoteNumber}</span>}</>}
        badge={detail && <StatusBadge status={detail.status} />}
        onClose={onClose}
      />
      <ModalBody>
        {loading && <p className="py-6 text-center text-sm text-slate-400">Loading…</p>}
        {error && <Alert tone="error">{error}</Alert>}
        {detail && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <InfoField label="Customer" value={detail.customerName} />
              <InfoField label="Valid Until" value={detail.validUntil ? formatDate(detail.validUntil) : "—"} />
              <InfoField label="Created By" value={detail.createdByName} />
              <InfoField label="Created" value={formatDateTime(detail.createdAt)} />
            </div>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-700">Line Items</h3>
              <LineItemsView items={detail.lineItems.map((li) => ({ ...li, unitPrice: li.unitPrice }))} />
              <TotalsPanel rows={totalsRows} total={{ label: "Grand Total", value: formatCurrency(detail.total) }} />
            </section>

            {detail.notes && (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-700">Notes / Terms</h3>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{detail.notes}</p>
              </section>
            )}

            {detail.hasOrder && detail.orderId && (
              <Alert tone="success">
                Already converted to order —{" "}
                <Link href={`/orders/${detail.orderId}`} className="font-medium underline">
                  View order
                </Link>
                .
              </Alert>
            )}
            {!detail.hasOrder && !detail.canConvertToOrder && detail.status !== "APPROVED" && (
              <Alert tone="info">Convert to Order becomes available once this quotation is Approved.</Alert>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        {detail && (
          <Link href={`/quotations/${detail.id}/print`} target="_blank">
            <Button type="button" variant="outline">
              Print / Download
            </Button>
          </Link>
        )}
        {detail?.canConvertToOrder && (
          <Link href={`/orders/new?quotationId=${detail.id}`}>
            <Button type="button">Convert to Order</Button>
          </Link>
        )}
      </ModalFooter>
    </Modal>
  );
}
