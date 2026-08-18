"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { EmptyState } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { startCustomerConversationAction } from "@/app/actions/messages";
import type { ReceivableRow } from "@/lib/dashboard-data";
import type { SoaBalanceStatus } from "@/lib/soa";

const STATUS_TONE: Record<SoaBalanceStatus, "green" | "yellow" | "red"> = {
  CURRENT: "green",
  DUE: "yellow",
  OVERDUE: "red",
};

/** Spec items 15/16 — SOA reuses the existing Statement of Account pages, Message reuses the existing Chatbox (never a new messaging system). */
export function ReceivablesList({ rows, canMessage }: { rows: ReceivableRow[]; canMessage: boolean }) {
  async function message(customerId: string) {
    const { id } = await startCustomerConversationAction(customerId);
    window.dispatchEvent(new CustomEvent("chatbox:open-conversation", { detail: { conversationId: id } }));
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Receivables Requiring Attention" actionLabel="View all" actionHref="/soa/monthly" />
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <EmptyState label="No outstanding balances." />}
        {rows.map((r) => (
          <div key={r.customerId} className="rounded-md border border-slate-100 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-slate-900">{r.customerName}</p>
              <Badge tone={STATUS_TONE[r.status]}>{r.status.replace(/_/g, " ")}</Badge>
            </div>
            <p className="mt-0.5 text-sm font-semibold text-slate-700">{formatCurrency(r.balance)} outstanding</p>
            <div className="mt-2 flex gap-1.5">
              <Link href={`/customers/${r.customerId}`}>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs">
                  View
                </Button>
              </Link>
              <Link href={`/soa/customer/${r.customerId}`}>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs">
                  SOA
                </Button>
              </Link>
              {canMessage && (
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => message(r.customerId)}>
                  Message
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
