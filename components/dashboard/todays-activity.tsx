import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { StatusBadge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import type { ActivityRow } from "@/lib/dashboard-data";

/**
 * Spec item 19 — every row is a real record; clicking it opens the actual
 * existing detail page, never a synthetic activity feed entity. Cell
 * padding/min-widths are overridden locally here (9th update, item 25's
 * "do not redesign unrelated components") rather than in the shared
 * Table/TH/TD primitives those defaults would also change every other
 * table in the app — this is a spacing correction scoped to this one
 * component. Horizontal scroll, when it's needed at all, stays contained
 * inside the CardContent's own overflow-x-auto wrapper, never the page.
 */
export function TodaysActivity({ rows, showAmounts }: { rows: ActivityRow[]; showAmounts: boolean }) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Today's Activity" actionLabel="View all" actionHref="/reports/summary" />
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState label="No transactions recorded today." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <THead>
                <TR>
                  <TH className="px-5 py-3 whitespace-nowrap">Time</TH>
                  <TH className="min-w-[140px] px-5 py-3">Customer</TH>
                  <TH className="min-w-[120px] px-5 py-3">Transaction</TH>
                  <TH className="min-w-[130px] px-5 py-3">Reference</TH>
                  {showAmounts && <TH className="min-w-[110px] px-5 py-3 text-right">Amount</TH>}
                  <TH className="px-5 py-3">Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-400">
                      {r.time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </TD>
                    <TD className="px-5 py-3.5 text-sm leading-snug break-words">{r.customer}</TD>
                    <TD className="px-5 py-3.5 text-sm leading-snug break-words text-slate-500">{r.transaction}</TD>
                    <TD className="px-5 py-3.5 leading-snug break-words">
                      <Link href={r.href} className="text-sm font-medium text-slate-900 underline">
                        {r.reference}
                      </Link>
                    </TD>
                    {showAmounts && (
                      <TD className="whitespace-nowrap px-5 py-3.5 text-right text-sm">
                        {r.amount !== null ? formatCurrency(r.amount) : "—"}
                      </TD>
                    )}
                    <TD className="px-5 py-3.5">
                      <StatusBadge status={r.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
