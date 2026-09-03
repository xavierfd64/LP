"use client";

import { useState } from "react";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { OrderDetailModal } from "./order-detail-modal";

export type OrderRow = {
  id: string;
  orderNumber: string;
  customerName: string;
  jobOrdersCount: number;
  total: string;
  status: string;
  orderDate: string;
  isHistorical: boolean;
  historicalOrderType: "PENDING_PRODUCTION" | "ALREADY_RELEASED" | null;
};

/**
 * "View" opens the Order Details modal in place (Aug 22 UI redesign
 * update 2, Part 4) instead of navigating to /orders/[id]. Staff/admin
 * only — the customer-facing "My Orders"/"Invoices" branch of
 * app/(app)/orders/page.tsx is untouched and keeps its own plain table
 * and invoice links exactly as before.
 */
export function OrdersTable({ orders, isStaffLike }: { orders: OrderRow[]; isStaffLike: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH>Order #</TH>
            {isStaffLike && <TH>Customer</TH>}
            <TH>Job Orders</TH>
            <TH>Total</TH>
            <TH>Status</TH>
            <TH>Order Date</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {orders.map((o) => (
            <TR key={o.id}>
              <TD className="font-medium text-slate-900">{o.orderNumber}</TD>
              {isStaffLike && <TD>{o.customerName}</TD>}
              <TD>{o.jobOrdersCount}</TD>
              <TD>{formatCurrency(o.total)}</TD>
              <TD>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={o.status} />
                  {o.isHistorical && (
                    <Badge tone="yellow">{o.historicalOrderType === "ALREADY_RELEASED" ? "Released (Historical)" : "Historical"}</Badge>
                  )}
                </div>
              </TD>
              <TD>{formatDate(o.orderDate)}</TD>
              <TD>
                <button type="button" onClick={() => setSelectedId(o.id)} className="text-sm font-medium text-brand-600 underline">
                  View
                </button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {orders.length === 0 && <EmptyState label="No orders match these filters." />}
      {selectedId && <OrderDetailModal orderId={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}
