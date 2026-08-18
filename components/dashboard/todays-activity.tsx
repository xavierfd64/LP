import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { StatusBadge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import type { ActivityRow } from "@/lib/dashboard-data";

/** Spec item 19 — every row is a real record; clicking it opens the actual existing detail page, never a synthetic activity feed entity. */
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
            <Table>
              <THead>
                <TR>
                  <TH>Time</TH>
                  <TH>Customer</TH>
                  <TH>Transaction</TH>
                  <TH>Reference</TH>
                  {showAmounts && <TH>Amount</TH>}
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap text-xs text-slate-400">
                      {r.time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </TD>
                    <TD className="text-sm">{r.customer}</TD>
                    <TD className="text-sm text-slate-500">{r.transaction}</TD>
                    <TD>
                      <Link href={r.href} className="text-sm font-medium text-slate-900 underline">
                        {r.reference}
                      </Link>
                    </TD>
                    {showAmounts && <TD className="text-sm">{r.amount !== null ? formatCurrency(r.amount) : "—"}</TD>}
                    <TD>
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
