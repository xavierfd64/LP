"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { InfoField } from "@/components/documents/editor-shell";
import { Alert } from "@/components/ui/alert";
import { getInquiryDetailAction, type InquiryDetailResult } from "@/app/actions/inquiry-detail";
import { formatDateTime } from "@/lib/utils";

type Detail = Extract<InquiryDetailResult, { ok: true }>["data"];

/**
 * Replaces navigating to /inquiries/[id] when "View" is clicked from the
 * staff/admin Inquiries list (Aug 22 UI redesign update 2, Part 4/5) —
 * fetches on open via getInquiryDetailAction (same authorization as the
 * full page) rather than requiring the list to preload every inquiry's
 * full detail up front. The full page itself is untouched and still
 * reachable directly (customer edit/cancel flow, chatbox deep-links,
 * "Linked quotations" links elsewhere in the app).
 */
export function InquiryDetailModal({ inquiryId, onClose }: { inquiryId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInquiryDetailAction(inquiryId).then((res) => {
      if (res.ok) setDetail(res.data);
      else setError(res.error);
      setLoading(false);
    });
  }, [inquiryId]);

  return (
    <Modal open onClose={onClose} maxWidthClassName="max-w-2xl">
      <ModalHeader
        title="Inquiry Details"
        subtitle={detail ? `Submitted ${formatDateTime(detail.submittedAt)}` : undefined}
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
              <InfoField label="Contact" value={detail.customerContact} />
              <InfoField label="Email" value={detail.customerEmail} />
              <InfoField label="Created By" value={detail.createdBy} />
            </div>

            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-700">Inquiry Information</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <InfoField label="Product / Service" value={detail.desiredProduct} />
                <InfoField label="Quantity" value={detail.roughQty ?? "—"} />
                <InfoField label="Submitted" value={formatDateTime(detail.submittedAt)} />
              </div>
              <div>
                <p className="mb-1 text-xs text-slate-400">Notes / Requirements</p>
                <p className="whitespace-pre-wrap text-sm text-slate-800">{detail.notes || "—"}</p>
              </div>
            </section>

            {detail.specs && Object.keys(detail.specs).length > 0 && (
              <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-700">Additional Details</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {Object.entries(detail.specs).map(([k, v]) => (
                    <InfoField key={k} label={k} value={v} />
                  ))}
                </div>
              </section>
            )}

            {detail.activeQuotation && (
              <Alert tone="info">
                This inquiry already has an active quotation —{" "}
                <Link href={`/quotations/${detail.activeQuotation.id}`} className="font-medium underline">
                  {detail.activeQuotation.quoteNumber}
                </Link>
                .
              </Alert>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        {detail?.canCreateQuotation && (
          <Link href={`/quotations/new?inquiryId=${detail.id}`}>
            <Button type="button">Create Quotation</Button>
          </Link>
        )}
      </ModalFooter>
    </Modal>
  );
}
