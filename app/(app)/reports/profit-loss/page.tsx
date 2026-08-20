import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";
import { resolvePeriodRange, parsePeriodSearchParams } from "@/lib/transaction-summary";
import { computeFinancialFoundation, getOperatingExpensesByCategory } from "@/lib/financial-summary";
import { PeriodSelector } from "../summary/period-selector";

function Line({
  label,
  value,
  emphasis,
  indent,
  negative,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  indent?: boolean;
  negative?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${emphasis ? "border-t border-slate-200 pt-3" : ""}`}>
      <span className={`${indent ? "pl-4 text-slate-500" : "text-slate-700"} ${emphasis ? "font-semibold text-slate-900" : "text-sm"}`}>
        {label}
      </span>
      <span
        className={`tabular-nums ${emphasis ? "text-lg font-bold text-slate-900" : "text-sm font-medium"} ${
          negative ? "text-error-600" : "text-slate-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Profit & Loss foundation (Aug 20 1st update, spec Part 12/13/16/17).
 * Reuses computeFinancialFoundation — the exact same figures the
 * dashboard's financial section shows for "This Month" — just with full
 * date-range control. Never renders a Net Profit figure the underlying
 * cost data can't actually support (spec item 17).
 */
export default async function ProfitLossPage({ searchParams }: PageProps<"/reports/profit-loss">) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "REPORTS_VIEW"))) redirect("/dashboard");

  const sp = await searchParams;
  const sel = parsePeriodSearchParams(sp);
  const range = resolvePeriodRange(sel);
  const [fin, expensesByCategory] = await Promise.all([
    computeFinancialFoundation(range),
    getOperatingExpensesByCategory(range),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Profit &amp; Loss</h1>
          <p className="text-sm text-slate-500">{range.label}</p>
        </div>
        <Link href="/reports/summary">
          <Button variant="outline">Transaction Summary</Button>
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
            basePath="/reports/profit-loss"
          />
        </CardContent>
      </Card>

      {!fin.cogsFullyConfigured && fin.cogsTotalCount > 0 && (
        <Alert tone="warning">
          Production cost is only available for {fin.cogsConfiguredCount} of {fin.cogsTotalCount} contributing
          order{fin.cogsTotalCount === 1 ? "" : "s"} this period — Gross Profit and Net Profit are not shown to avoid
          understating them. Configure production cost on the relevant Services, or record production consumption, to
          complete this report.
        </Alert>
      )}
      {fin.cogsTotalCount > 0 && (
        <p className="text-xs text-slate-400">
          Costing Coverage: {fin.cogsConfiguredCount} / {fin.cogsTotalCount} contributing orders this period (
          {Math.round((fin.cogsConfiguredCount / fin.cogsTotalCount) * 100)}%)
          {fin.costingCoveragePct != null && (
            <> · Of costed orders, {fin.costingCoveragePct}% used actual production cost rather than the BOM estimate.</>
          )}
        </p>
      )}

      <Card>
        <CardContent className="py-5">
          <Line label="Revenue / Gross Sales" value={formatCurrency(fin.revenue)} />
          <Line label="Production Cost / COGS" value={fin.cogsFullyConfigured ? `(${formatCurrency(fin.cogs)})` : "Not fully configured"} indent negative={fin.cogsFullyConfigured} />
          <Line
            label="GROSS PROFIT"
            value={fin.grossProfit != null ? formatCurrency(fin.grossProfit) : "Not available"}
            emphasis
          />
          <Line
            label="Operating Expenses"
            value={fin.operatingExpenses > 0 ? `(${formatCurrency(fin.operatingExpenses)})` : formatCurrency(0)}
            indent
            negative={fin.operatingExpenses > 0}
          />
          <Line label="NET PROFIT" value={fin.netProfit != null ? formatCurrency(fin.netProfit) : "Not available"} emphasis />
        </CardContent>
      </Card>

      {expensesByCategory.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Operating Expenses by Category</p>
            <div className="space-y-1.5">
              {expensesByCategory.map((c) => (
                <div key={c.categoryId} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{c.categoryName}</span>
                  <span className="tabular-nums font-medium text-slate-900">{formatCurrency(c.total)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 text-sm font-semibold">
                <span className="text-slate-900">Total</span>
                <span className="tabular-nums text-slate-900">{formatCurrency(fin.operatingExpenses)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-xs uppercase text-slate-500">Gross Profit Margin</p>
            <p className="text-xl font-semibold text-slate-900">{fin.grossMargin != null ? `${fin.grossMargin.toFixed(1)}%` : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-xs uppercase text-slate-500">Net Profit Margin</p>
            <p className="text-xl font-semibold text-slate-900">{fin.netMargin != null ? `${fin.netMargin.toFixed(1)}%` : "—"}</p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-slate-400">
        Revenue reflects confirmed payments received in this period. Production Cost is estimated from the full
        Quotation of every Order that received a payment in this period (not prorated to partial payments) — a
        deliberate simplification for this foundation; full accrual-based costing is a future update. Operating
        Expenses reflects expenses recorded with a date in this period.
      </p>
    </div>
  );
}
