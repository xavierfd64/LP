import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Receipt, Wallet, Clock, AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { computeStatementOfAccount, deriveSoaBalanceStatus } from "@/lib/soa";
import { getReceivableDetails } from "@/lib/dashboard-data";
import { resolvePeriodRange } from "@/lib/transaction-summary";
import { PeriodForm } from "./period-form";
import { AdjustmentForm } from "./adjustment-form";
import { ScheduleForm } from "./schedule-form";
import { SoaFilters, type SoaDateRangeValue, type SoaTypeValue } from "./soa-filters";
import { SoaQuickActions } from "./soa-quick-actions";
import type { OrderSearchResult } from "@/app/actions/order-search";

const STATUS_TONE = { CURRENT: "blue", DUE: "yellow", OVERDUE: "red" } as const;
const DATE_RANGE_VALUES: readonly string[] = ["all", "monthly", "quarterly", "annual", "custom"];
const TYPE_VALUES: readonly string[] = ["all", "orders", "payments", "outstanding", "overdue"];

/** Ledger row's own historical-order/payment flag renders as a small "(Old)" badge — see SoaTransactionRow.isHistorical's doc comment. */
function typeLabel(type: "ORDER" | "PAYMENT" | "ADJUSTMENT") {
  return type === "ORDER" ? "Order" : type === "PAYMENT" ? "Payment" : "Adjustment";
}

export default async function CustomerSoaPage({
  params,
  searchParams,
}: PageProps<"/soa/customer/[customerId]">) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "SOA_VIEW"))) redirect("/dashboard");
  const canGenerate = user.role === "ADMIN" || (await can(user, "SOA_GENERATE"));
  const canShare = user.role === "ADMIN" || (await can(user, "SOA_SHARE"));
  const canRecord = user.role === "ADMIN" || (await can(user, "PAYMENT_RECORD"));
  const canRecordHistorical = user.role === "ADMIN" || (await can(user, "PAYMENT_BACKDATE"));
  const canMessage = user.role === "ADMIN" || (await can(user, "COMMUNICATION_SEARCH_CUSTOMER"));

  const { customerId } = await params;
  const sp = await searchParams;
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) notFound();

  const range = (typeof sp.range === "string" && DATE_RANGE_VALUES.includes(sp.range) ? sp.range : "annual") as SoaDateRangeValue;
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const typeFilter = (typeof sp.type === "string" && TYPE_VALUES.includes(sp.type) ? sp.type : "all") as SoaTypeValue;

  // Date Range only decides what's DISPLAYED in the Financial Summary's
  // Total Charges/Total Payments and the Transaction History ledger below —
  // never what Outstanding/Overdue mean (those stay live/current, read from
  // getReceivableDetails, the same source the Dashboard's Receivables card
  // and this customer's Receivable Details modal already use, per the
  // "SOA/Receivables/Dashboard must agree" requirement).
  let periodStart: Date;
  let periodEnd: Date;
  let periodLabel: string;
  if (range === "custom" && from && to) {
    periodStart = new Date(from + "T00:00:00");
    const endInclusive = new Date(to + "T00:00:00");
    periodEnd = new Date(endInclusive.getFullYear(), endInclusive.getMonth(), endInclusive.getDate() + 1);
    periodLabel = `${formatDate(periodStart)} – ${formatDate(endInclusive)}`;
  } else if (range === "all" || (range === "custom" && (!from || !to))) {
    periodStart = new Date(0);
    periodEnd = new Date();
    periodLabel = "All Time";
  } else {
    const resolved = resolvePeriodRange({ type: range as "monthly" | "quarterly" | "annual" });
    periodStart = resolved.start;
    periodEnd = resolved.end;
    periodLabel = resolved.label;
  }

  const [statements, openOrders, schedule, snapshot, receivable] = await Promise.all([
    prisma.statementOfAccount.findMany({ where: { customerId }, orderBy: { generatedAt: "desc" }, take: 20 }),
    prisma.order.findMany({ where: { customerId, status: { not: "CANCELLED" } }, select: { dueDate: true } }),
    prisma.statementSchedule.findFirst({ where: { customerId } }),
    computeStatementOfAccount(customerId, periodStart, periodEnd),
    getReceivableDetails(customerId),
  ]);

  const balanceStatus = deriveSoaBalanceStatus(openOrders);
  const outstandingByRef = new Map((receivable?.transactions ?? []).map((t) => [t.reference, t]));

  const filteredRows = snapshot.rows.filter((r) => {
    if (typeFilter === "orders") return r.type === "ORDER";
    if (typeFilter === "payments") return r.type === "PAYMENT";
    if (typeFilter === "outstanding") return r.type === "ORDER" && outstandingByRef.has(r.reference);
    if (typeFilter === "overdue") return r.type === "ORDER" && outstandingByRef.get(r.reference)?.status === "OVERDUE";
    return true;
  });

  const latestStatementId = statements[0]?.id ?? null;
  const defaultOrder: OrderSearchResult | null =
    receivable && receivable.transactions.length === 1
      ? {
          id: receivable.transactions[0].id,
          orderNumber: receivable.transactions[0].reference,
          customerName: customer.name,
          customerPhone: customer.contactNumber,
          quoteNumber: null,
        }
      : null;

  const totalOutstanding = receivable?.totalOutstanding ?? 0;
  const overdueAmount = receivable?.overdue ?? 0;
  const currentNotYetDue = receivable ? receivable.current + receivable.due : Math.max(totalOutstanding - overdueAmount, 0);

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
          <p className="text-sm text-slate-500">
            {customer.displayId}
            {customer.companyName ? ` · ${customer.companyName}` : ""}
          </p>
        </div>
        {totalOutstanding > 0.01 && <Badge tone={STATUS_TONE[balanceStatus]}>{balanceStatus.replace(/_/g, " ")}</Badge>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Customer Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <CustomerInfoField label="Address" value={customer.address} />
              <CustomerInfoField label="Email" value={customer.email} />
              <CustomerInfoField label="Contact Number" value={customer.contactNumber} />
              <CustomerInfoField label="Facebook" value={customer.facebookUrl} isLink />
              <CustomerInfoField label="Customer Since" value={formatDate(customer.createdAt)} />
              <CustomerInfoField label="Qualified for Terms" value={customer.isQualifiedForTerms ? "Yes" : "No"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Financial Summary — {periodLabel}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard label="Total Charges" value={formatCurrency(snapshot.totalCharges)} icon={Receipt} iconTone="blue" />
              <KpiCard label="Total Payments" value={formatCurrency(snapshot.totalPayments)} icon={Wallet} iconTone="green" />
              <KpiCard label="Outstanding Balance" value={formatCurrency(Math.max(totalOutstanding, 0))} icon={Clock} iconTone="orange" />
              <KpiCard label="Overdue Balance" value={formatCurrency(overdueAmount)} icon={AlertTriangle} iconTone="red" tone={overdueAmount > 0 ? "attention" : "default"} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-l-4 border-l-brand-600">
            <CardHeader>
              <CardTitle>Account Balance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <BalanceRow label="Total Charges" value={formatCurrency(snapshot.totalCharges)} />
              <BalanceRow label="Total Payments" value={formatCurrency(snapshot.totalPayments)} />
              <BalanceRow label="Outstanding Balance" value={formatCurrency(Math.max(totalOutstanding, 0))} emphasize />
              <BalanceRow label="Current (Not Yet Due)" value={formatCurrency(currentNotYetDue)} />
              <BalanceRow label="Overdue" value={formatCurrency(overdueAmount)} tone={overdueAmount > 0 ? "red" : undefined} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <SoaQuickActions
                customerId={customerId}
                customerName={customer.name}
                defaultOrder={defaultOrder}
                latestStatementId={latestStatementId}
                canRecord={canRecord}
                canRecordHistorical={canRecordHistorical}
                canShare={canShare}
                canMessage={canMessage}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="border-b border-slate-100 pb-4">
          <SoaFilters range={range} from={from} to={to} type={typeFilter} />
        </CardContent>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH>Reference</TH>
                <TH>Description</TH>
                <TH>Charges</TH>
                <TH>Payments</TH>
                <TH>Balance</TH>
              </TR>
            </THead>
            <TBody>
              {filteredRows.map((r, i) => (
                <TR key={i}>
                  <TD className="whitespace-nowrap text-sm">{formatDate(r.date)}</TD>
                  <TD className="text-sm">
                    <div className="flex items-center gap-1.5">
                      {typeLabel(r.type)}
                      {r.isHistorical && <Badge tone="yellow">Old</Badge>}
                    </div>
                  </TD>
                  <TD className="text-sm font-medium text-slate-900">{r.reference}</TD>
                  <TD className="text-sm text-slate-600">{r.description}</TD>
                  <TD>{r.charge > 0 ? formatCurrency(r.charge) : "—"}</TD>
                  <TD>{r.payment > 0 ? formatCurrency(r.payment) : "—"}</TD>
                  <TD className="font-medium">{formatCurrency(r.runningBalance)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        {filteredRows.length === 0 && <EmptyState label="No transactions match this filter." />}
      </Card>

      {canGenerate && (
        <Card>
          <CardHeader>
            <CardTitle>Generate Statement of Account</CardTitle>
          </CardHeader>
          <CardContent>
            <PeriodForm customerId={customerId} />
          </CardContent>
        </Card>
      )}

      {canGenerate && (
        <Card>
          <CardHeader>
            <CardTitle>Adjustments / Credits</CardTitle>
          </CardHeader>
          <CardContent>
            <AdjustmentForm customerId={customerId} />
          </CardContent>
        </Card>
      )}

      {canGenerate && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Statement Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <ScheduleForm
              customerId={customerId}
              schedule={
                schedule
                  ? {
                      id: schedule.id,
                      dayOfMonth: schedule.dayOfMonth,
                      onlyIfOutstanding: schedule.onlyIfOutstanding,
                      enabled: schedule.enabled,
                      lastRunAt: schedule.lastRunAt ? schedule.lastRunAt.toISOString() : null,
                    }
                  : null
              }
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Previous Statements</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Statement No.</TH>
              <TH>Period</TH>
              <TH>Generated</TH>
              <TH>Outstanding</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {statements.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium text-slate-900">{s.statementNumber}</TD>
                <TD className="text-sm text-slate-600">
                  {formatDate(s.periodStart)} – {formatDate(new Date(s.periodEnd.getTime() - 1))}
                </TD>
                <TD className="text-sm text-slate-500">{formatDateTime(s.generatedAt)}</TD>
                <TD>{formatCurrency(s.outstandingBalance.toString())}</TD>
                <TD>
                  <Link href={`/soa/view/${s.id}`} className="text-sm font-medium text-brand-600 underline">
                    View
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {statements.length === 0 && <EmptyState label="No statements generated yet." />}
      </Card>
    </div>
  );
}

function BalanceRow({ label, value, tone, emphasize }: { label: string; value: string; tone?: "red"; emphasize?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={emphasize ? "text-base font-bold text-slate-900" : tone === "red" ? "font-medium text-red-600" : "font-medium text-slate-900"}>
        {value}
      </span>
    </div>
  );
}

/**
 * One field of the customer information card (9th update fix). `min-w-0`
 * is the actual fix for the Facebook-overflow bug: CSS grid items default
 * to `min-width: auto`, which lets an unbroken string like a URL force its
 * column wider than the card and push past the card boundary — `min-w-0`
 * plus `break-words` lets the value wrap inside its own column instead.
 * Generalized to every field here (not a Facebook-only patch) since email
 * and address can be just as long. Facebook renders as a real clickable
 * link when it's a value, normalized to a full https:// URL if the stored
 * value is a bare "facebook.com/..." string.
 */
function CustomerInfoField({ label, value, isLink }: { label: string; value: string | null; isLink?: boolean }) {
  const href = isLink && value ? (value.startsWith("http") ? value : `https://${value}`) : null;
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="break-words text-sm text-brand-600 underline">
          {value}
        </a>
      ) : (
        <p className="break-words text-sm text-slate-900">{value || "—"}</p>
      )}
    </div>
  );
}
