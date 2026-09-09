"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import type { RecentTransactionRow } from "@/lib/dashboard-data";

const TABS = [
  { key: "all", label: "Recent Transactions" },
  { key: "inquiries", label: "Recent Inquiries" },
  { key: "quotations", label: "Recent Quotations" },
  { key: "orders", label: "Recent Orders" },
  { key: "payments", label: "Recent Payments" },
] as const;

const TYPE_BADGE_TONE: Record<string, "blue" | "purple" | "green" | "slate"> = {
  Inquiry: "slate",
  Quotation: "purple",
  Order: "blue",
  Payment: "green",
};

/** "Recent Transactions" tabbed table (Whiskey dashboard reference) — every row here is a real record with a working link to its own detail page, never a synthetic activity-log entity. */
export function RecentTransactionsCard({
  data,
  viewAllHref,
  showAmounts = true,
}: {
  data: { all: RecentTransactionRow[]; inquiries: RecentTransactionRow[]; quotations: RecentTransactionRow[]; orders: RecentTransactionRow[]; payments: RecentTransactionRow[] };
  viewAllHref: string;
  /** Same gating TodaysActivity already uses for a Staff account without payment-visibility permissions — hides amounts, never a duplicate permission check. */
  showAmounts?: boolean;
}) {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("all");
  const rows = data[active];

  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Recent Transactions" actionLabel="View All" actionHref={viewAllHref} />
        <Tabs tabs={TABS} active={active} onChange={(k) => setActive(k as typeof active)} className="mt-3 -mb-4" />
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState label="No records yet." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="w-8">#</TH>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH>Reference No.</TH>
                <TH>Customer</TH>
                {showAmounts && <TH className="text-right">Amount</TH>}
                <TH>Status</TH>
                <TH>Action</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row, i) => (
                <TR key={row.id}>
                  <TD className="text-slate-400">{i + 1}</TD>
                  <TD className="whitespace-nowrap text-xs text-slate-500">
                    {/* Explicit timeZone (not the host's local TZ) — this card is a Client Component that's also server-rendered, so a Date formatted without a fixed zone renders differently on the Node server vs. the browser and fails hydration. */}
                    {row.date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Manila" })}{" "}
                    {row.date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })}
                  </TD>
                  <TD>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        TYPE_BADGE_TONE[row.type] === "purple"
                          ? "bg-accent-100 text-accent-800"
                          : TYPE_BADGE_TONE[row.type] === "blue"
                          ? "bg-info-100 text-info-800"
                          : TYPE_BADGE_TONE[row.type] === "green"
                          ? "bg-success-100 text-success-800"
                          : "bg-slate-200 text-slate-800"
                      }`}
                    >
                      {row.type}
                    </span>
                  </TD>
                  <TD className="font-medium text-slate-900">{row.reference}</TD>
                  <TD>{row.customer}</TD>
                  {showAmounts && <TD className="text-right font-medium">{row.amount != null ? formatCurrency(row.amount) : "—"}</TD>}
                  <TD>
                    <StatusBadge status={row.status} />
                  </TD>
                  <TD>
                    <Link href={row.href} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                      View
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
