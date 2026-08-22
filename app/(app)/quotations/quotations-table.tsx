"use client";

import { useState } from "react";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { QuotationDetailModal } from "./quotation-detail-modal";

export type QuotationRow = {
  id: string;
  quoteNumber: string;
  customerName: string;
  total: string;
  status: string;
  createdAt: string;
};

/** "View" opens the Quotation Details modal in place (Aug 22 UI redesign update 2, Part 4) instead of navigating to /quotations/[id]. */
export function QuotationsTable({ quotations, isStaffLike }: { quotations: QuotationRow[]; isStaffLike: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH>Number</TH>
            {isStaffLike && <TH>Customer</TH>}
            <TH>Total</TH>
            <TH>Status</TH>
            <TH>Created</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {quotations.map((q) => (
            <TR key={q.id}>
              <TD className="font-medium text-slate-900">{q.quoteNumber}</TD>
              {isStaffLike && <TD>{q.customerName}</TD>}
              <TD>{formatCurrency(q.total)}</TD>
              <TD>
                <StatusBadge status={q.status} />
              </TD>
              <TD>{formatDate(q.createdAt)}</TD>
              <TD>
                <button type="button" onClick={() => setSelectedId(q.id)} className="text-sm font-medium text-brand-600 underline">
                  View
                </button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {quotations.length === 0 && <EmptyState label="No quotations match these filters." />}
      {selectedId && <QuotationDetailModal quotationId={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}
