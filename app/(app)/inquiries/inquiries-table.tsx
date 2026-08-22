"use client";

import { useState } from "react";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { InquiryDetailModal } from "./inquiry-detail-modal";

export type InquiryRow = {
  id: string;
  customerName: string;
  product: string;
  qty: number | null;
  status: string;
  createdAt: string;
};

/**
 * "View" opens the Inquiry Details modal in place (Aug 22 UI redesign
 * update 2, Part 4) instead of navigating to /inquiries/[id] — the modal
 * fetches its own detail data on open (getInquiryDetailAction), so this
 * component only needs the lightweight row data the list already fetched.
 * Search/filter/pagination state lives in the URL (handled by the parent
 * Server Component page + ListFilters), so opening/closing this modal
 * never touches or resets it.
 */
export function InquiriesTable({ inquiries, isStaffLike }: { inquiries: InquiryRow[]; isStaffLike: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <Table>
        <THead>
          <TR>
            {isStaffLike && <TH>Customer</TH>}
            <TH>Product / Service</TH>
            <TH>Quantity</TH>
            <TH>Status</TH>
            <TH>Submitted</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {inquiries.map((inq) => (
            <TR key={inq.id}>
              {isStaffLike && <TD>{inq.customerName}</TD>}
              <TD>{inq.product}</TD>
              <TD>{inq.qty ?? "—"}</TD>
              <TD>
                <StatusBadge status={inq.status} />
              </TD>
              <TD>{formatDate(inq.createdAt)}</TD>
              <TD>
                <button type="button" onClick={() => setSelectedId(inq.id)} className="text-sm font-medium text-brand-600 underline">
                  View
                </button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {inquiries.length === 0 && <EmptyState label="No inquiries match these filters." />}
      {selectedId && <InquiryDetailModal inquiryId={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}
