import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { resolvePeriodRange, parsePeriodSearchParams } from "@/lib/transaction-summary";
import { computeServiceProfitability } from "@/lib/profitability-reports";
import { PeriodSelector } from "../summary/period-selector";

/**
 * Which services are actually profitable, from real transactions only
 * (Aug 20 5th update, Part 5 item 26) — reuses the same
 * actual-cost-preferred-over-estimate logic as the P&L, just broken down
 * per Service instead of totaled across the business.
 */
export default async function ServiceProfitabilityPage({ searchParams }: PageProps<"/reports/service-profitability">) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "REPORTS_VIEW"))) redirect("/dashboard");

  const sp = await searchParams;
  const sel = parsePeriodSearchParams(sp);
  const range = resolvePeriodRange(sel);
  const rows = await computeServiceProfitability(range);

  const totalSales = rows.reduce((sum, r) => sum + r.sales, 0);
  const knownCostRows = rows.filter((r) => r.cost != null);
  const totalCost = knownCostRows.length === rows.length ? knownCostRows.reduce((sum, r) => sum + (r.cost ?? 0), 0) : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Service Profitability</h1>
          <p className="text-sm text-slate-500">{range.label}</p>
        </div>
        <Link href="/reports/profit-loss">
          <Button variant="outline">Profit &amp; Loss</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="py-4">
          <PeriodSelector
            type={sel.type}
            date={sel.date}
            month={sel.month}
            year={sel.year}
            quarter={sel.quarter}
            half={sel.half}
            basePath="/reports/service-profitability"
          />
        </CardContent>
      </Card>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Service</TH>
              <TH>Sales</TH>
              <TH>Cost</TH>
              <TH>Profit</TH>
              <TH>Margin</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.serviceId}>
                <TD className="font-medium text-slate-900">{r.serviceName}</TD>
                <TD>{formatCurrency(r.sales)}</TD>
                <TD className={r.cost == null ? "text-amber-600" : ""}>
                  {r.cost != null ? formatCurrency(r.cost) : `Incomplete (${r.configuredLines}/${r.totalLines})`}
                </TD>
                <TD className="font-medium">{r.profit != null ? formatCurrency(r.profit) : "Not available"}</TD>
                <TD>{r.marginPct != null ? `${r.marginPct.toFixed(1)}%` : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {rows.length === 0 && <EmptyState label="No contributing sales in this period." />}
      </Card>

      {rows.length > 0 && (
        <Card className="px-5 py-4">
          <p className="text-xs uppercase text-slate-500">Total</p>
          <p className="text-lg font-semibold text-slate-900">
            Sales {formatCurrency(totalSales)} — Cost {totalCost != null ? formatCurrency(totalCost) : "Incomplete"}
          </p>
        </Card>
      )}
    </div>
  );
}
