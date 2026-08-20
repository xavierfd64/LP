import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { resolvePeriodRange, parsePeriodSearchParams } from "@/lib/transaction-summary";
import { computeMaterialConsumptionReport } from "@/lib/profitability-reports";
import { PeriodSelector } from "../summary/period-selector";

/**
 * What materials were actually consumed, and where actual usage exceeded
 * the BOM's expected consumption (Aug 20 5th update, Part 5 items 27/28).
 * A variance here is not automatically "waste" (spec item 29) — it's
 * shown next to whatever `varianceReason` was recorded, never assumed.
 */
export default async function MaterialConsumptionReportPage({ searchParams }: PageProps<"/reports/material-consumption">) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "REPORTS_VIEW"))) redirect("/dashboard");

  const sp = await searchParams;
  const sel = parsePeriodSearchParams(sp);
  const range = resolvePeriodRange(sel);
  const rows = await computeMaterialConsumptionReport(range);

  const totalCost = rows.every((r) => r.totalCost != null) ? rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0) : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Material Consumption &amp; Variance</h1>
          <p className="text-sm text-slate-500">{range.label} — based on recorded production consumption</p>
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
            basePath="/reports/material-consumption"
          />
        </CardContent>
      </Card>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Material</TH>
              <TH>Quantity Used</TH>
              <TH>Cost</TH>
              <TH>Expected</TH>
              <TH>Variance</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.inventoryItemId}>
                <TD className="font-medium text-slate-900">{r.materialName}</TD>
                <TD>
                  {r.totalActualQty} {r.unit}
                </TD>
                <TD>{r.totalCost != null ? formatCurrency(r.totalCost) : "Cost unavailable"}</TD>
                <TD className="text-slate-500">{r.totalExpectedQty != null ? `${r.totalExpectedQty} ${r.unit}` : "—"}</TD>
                <TD className={r.variance != null && r.variance > 0 ? "text-amber-600" : ""}>
                  {r.variance != null
                    ? `${r.variance > 0 ? "+" : ""}${r.variance} ${r.unit} (${r.variancePct != null ? `${r.variancePct > 0 ? "+" : ""}${r.variancePct.toFixed(1)}%` : "—"})`
                    : "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {rows.length === 0 && <EmptyState label="No production consumption recorded in this period." />}
      </Card>

      {rows.length > 0 && (
        <Card className="px-5 py-4">
          <p className="text-xs uppercase text-slate-500">Total Material Cost</p>
          <p className="text-lg font-semibold text-slate-900">{totalCost != null ? formatCurrency(totalCost) : "Incomplete — some consumption has no cost basis"}</p>
        </Card>
      )}

      <p className="text-xs text-slate-400">
        A variance above the expected BOM quantity is not automatically waste — check each consumption record&apos;s
        recorded reason on the relevant Job Order for context (reprint, customer change, damaged material, etc.).
      </p>
    </div>
  );
}
