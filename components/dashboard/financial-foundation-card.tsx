import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { formatCurrency } from "@/lib/utils";
import type { FinancialFoundationSummary } from "@/lib/financial-summary";

/**
 * Sales -> Production Cost -> Gross Profit -> Operating Expenses -> Net
 * Profit, for the current month (Aug 20 1st update, spec item 11). Renders
 * "Not available" rather than a guessed number whenever the underlying
 * cost data doesn't fully cover this period's contributing Orders — see
 * lib/financial-summary.ts's own accuracy rule.
 */
export function FinancialFoundationCard({ fin }: { fin: FinancialFoundationSummary }) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title="This Month's Financials" />
      </CardHeader>
      <CardContent className="space-y-2 py-2">
        <Row label="Sales" value={formatCurrency(fin.revenue)} />
        <Row label="Production Cost" value={fin.cogsFullyConfigured ? formatCurrency(fin.cogs) : "Incomplete"} muted={!fin.cogsFullyConfigured} />
        <Row label="Gross Profit" value={fin.grossProfit != null ? formatCurrency(fin.grossProfit) : "Not available"} muted={fin.grossProfit == null} strong />
        <Row label="Operating Expenses" value={formatCurrency(fin.operatingExpenses)} />
        <Row label="Net Profit" value={fin.netProfit != null ? formatCurrency(fin.netProfit) : "Not available"} muted={fin.netProfit == null} strong border />
        {!fin.cogsFullyConfigured && fin.cogsTotalCount > 0 && (
          <p className="pt-1 text-xs text-amber-600">
            Production cost known for {fin.cogsConfiguredCount} of {fin.cogsTotalCount} items this month.{" "}
            <Link href="/admin/services" className="underline">
              Configure Service costs
            </Link>
            .
          </p>
        )}
        <Link href="/reports/profit-loss" className="block pt-1 text-xs font-medium text-brand-600 underline">
          View full Profit &amp; Loss →
        </Link>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, muted, strong, border }: { label: string; value: string; muted?: boolean; strong?: boolean; border?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-sm ${border ? "border-t border-slate-100 pt-2" : ""}`}>
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : "font-medium"} ${muted ? "text-slate-400" : "text-slate-900"}`}>{value}</span>
    </div>
  );
}
