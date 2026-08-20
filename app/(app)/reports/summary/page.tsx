import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, cn } from "@/lib/utils";
import { OrdersByStatusChart, PaymentsByMethodChart } from "@/components/dashboard/admin-charts";
import { resolvePeriodRange, computeTransactionSummary, parsePeriodSearchParams } from "@/lib/transaction-summary";
import { PeriodSelector } from "./period-selector";

export default async function TransactionSummaryPage({ searchParams }: PageProps<"/reports/summary">) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "REPORTS_VIEW"))) redirect("/dashboard");
  const canExport = user.role === "ADMIN" || (await can(user, "REPORTS_EXPORT"));

  const sp = await searchParams;
  const sel = parsePeriodSearchParams(sp);
  const range = resolvePeriodRange(sel);
  const summary = await computeTransactionSummary(range);

  const printParams = new URLSearchParams({
    type: sel.type,
    date: sel.date,
    month: sel.month,
    year: String(sel.year),
    quarter: String(sel.quarter),
    half: String(sel.half),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transaction Summary</h1>
          <p className="text-sm text-slate-500">{range.label}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/reports/profit-loss">
            <Button variant="outline">View Profit &amp; Loss</Button>
          </Link>
          {canExport && (
            <Link href={`/reports/summary/print?${printParams.toString()}`} target="_blank">
              <Button>Generate PDF</Button>
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <PeriodSelector type={sel.type} date={sel.date} month={sel.month} year={sel.year} quarter={sel.quarter} half={sel.half} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="Total Inquiries" value={summary.totalInquiries} href="/inquiries" />
        <Metric label="Total Quotations" value={summary.totalQuotations} href="/quotations" />
        <Metric label="Total Orders" value={summary.totalOrders} href="/orders" />
        <Metric label="Total Invoices" value={summary.totalInvoices} href="/orders" />
        <Metric label="Total Payments" value={summary.totalPayments} href="/payments" />
        <Metric label="Sales / Revenue" value={formatCurrency(summary.salesRevenue)} />
        <Metric label="Outstanding Balance" value={formatCurrency(summary.outstandingBalance)} tone="attention" />
        <Metric label="Cancelled" value={summary.cancelled} tone={summary.cancelled > 0 ? "attention" : undefined} />
        <Metric label="Completed" value={summary.completed} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Orders by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <OrdersByStatusChart data={summary.ordersByStatus} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Confirmed Payments by Method</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentsByMethodChart data={summary.paymentsByMethod} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  href?: string;
  tone?: "attention";
}) {
  const content = (
    <Card className={cn("border-l-4 transition-shadow hover:shadow-md", tone === "attention" ? "border-l-amber-400" : "border-l-brand-600")}>
      <CardContent className="py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">{value}</p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
