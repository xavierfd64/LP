import Link from "next/link";
import { redirect } from "next/navigation";
import { Wallet, Receipt, Clock, AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { getBusinessSettings } from "@/lib/business-settings";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { confirmPaymentAction, rejectPaymentAction } from "@/app/actions/payments";
import { getPaymentsSummary, getPaginatedPayments } from "@/lib/payments-list";
import type { PaymentFilterPeriod } from "@/lib/payment-filter-periods";
import { RecordPaymentModal } from "./record-payment-modal";
import { PaymentFilters } from "./payment-filters";
import { PaymentsPagination } from "./payments-pagination";
import { ExportPaymentsDialog } from "./export-payments-dialog";

const PAGE_SIZE = 15;

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  if (!isStaffLike && user.role !== "CUSTOMER") redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "PAYMENT_VIEW"))) redirect("/dashboard");

  if (!isStaffLike) {
    // Distinct nav identity for the Customer sidebar's "Statement of
    // Account" item (spec Aug 19 corrective update, item 2) — same hub
    // page (there's no separate customer SOA route), but the heading and
    // section order reflect the SOA framing rather than the payments one.
    const sp = await searchParams;
    const isSoaView = sp.view === "soa";
    const customer = await getCurrentCustomer(user.id);
    const [orders, statements] = await Promise.all([
      prisma.order.findMany({
        where: { customerId: customer.id },
        include: { payments: { orderBy: { paymentDate: "desc" } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.statementOfAccount.findMany({ where: { customerId: customer.id }, orderBy: { generatedAt: "desc" }, take: 12 }),
    ]);

    const allPayments = orders
      .flatMap((o) => o.payments.map((p) => ({ ...p, order: o })))
      .sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime());

    let totalPaid = 0;
    let totalOutstanding = 0;
    const orderSummaries = orders.map((o) => {
      const confirmed = o.payments
        .filter((p) => p.status === "CONFIRMED")
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const total = Number(o.totalAmount);
      const balance = Math.max(total - confirmed, 0);
      totalPaid += confirmed;
      totalOutstanding += balance;
      return { order: o, confirmed, total, balance };
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{isSoaView ? "Statement of Account" : "My Payments"}</h1>
            <p className="text-sm text-slate-500">
              {isSoaView ? "Your consolidated statements and balances." : "Your payment history and balances across every order."}
            </p>
          </div>
          {totalOutstanding > 0 && (
            <Link href="/payments/pay">
              <Button>Make a Payment</Button>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="space-y-1 py-4">
              <p className="text-xs uppercase text-slate-500">Total amount paid</p>
              <p className="text-xl font-semibold text-green-700">{formatCurrency(totalPaid)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-1 py-4">
              <p className="text-xs uppercase text-slate-500">Outstanding balance</p>
              <p className="text-xl font-semibold text-yellow-700">{formatCurrency(totalOutstanding)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-1 py-4">
              <p className="text-xs uppercase text-slate-500">Orders with balance due</p>
              <p className="text-xl font-semibold text-slate-900">
                {orderSummaries.filter((s) => s.balance > 0).length}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Statement of Account</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Statement No.</TH>
                  <TH>Period</TH>
                  <TH>Outstanding Balance</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {statements.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-medium text-slate-900">{s.statementNumber}</TD>
                    <TD className="text-sm text-slate-500">
                      {new Date(s.periodStart).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} –{" "}
                      {new Date(s.periodEnd.getTime() - 1).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    </TD>
                    <TD>{formatCurrency(s.outstandingBalance.toString())}</TD>
                    <TD>
                      <Link href={`/soa/${s.id}/print`} target="_blank" className="text-sm font-medium text-brand-600 underline">
                        View
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          {statements.length === 0 && <EmptyState label="No statements have been issued yet." />}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Balance by order</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Order</TH>
                  <TH>Total</TH>
                  <TH>Paid</TH>
                  <TH>Remaining due</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {orderSummaries.map((s) => (
                  <TR key={s.order.id}>
                    <TD>
                      <Link href={`/orders/${s.order.id}`} className="font-medium text-slate-900 underline">
                        {s.order.orderNumber}
                      </Link>
                    </TD>
                    <TD>{formatCurrency(s.total)}</TD>
                    <TD>{formatCurrency(s.confirmed)}</TD>
                    <TD className={s.balance > 0 ? "font-medium text-yellow-700" : "text-slate-500"}>
                      {formatCurrency(s.balance)}
                    </TD>
                    <TD>
                      <StatusBadge status={s.order.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          {orderSummaries.length === 0 && <EmptyState label="No orders yet." />}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment history</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Order</TH>
                  <TH>Amount</TH>
                  <TH>Method</TH>
                  <TH>Reference #</TH>
                  <TH>Status</TH>
                  <TH>Proof</TH>
                </TR>
              </THead>
              <TBody>
                {allPayments.map((p) => (
                  <TR key={p.id}>
                    <TD>{formatDateTime(p.paymentDate)}</TD>
                    <TD>
                      <Link href={`/orders/${p.orderId}`} className="font-medium text-slate-900 underline">
                        {p.order.orderNumber}
                      </Link>
                    </TD>
                    <TD>{formatCurrency(p.amount.toString())}</TD>
                    <TD>{p.method.replace(/_/g, " ")}</TD>
                    <TD>{p.referenceNumber ?? "—"}</TD>
                    <TD>
                      <StatusBadge status={p.status} />
                    </TD>
                    <TD>
                      {p.proofFilePath ? (
                        <a href={p.proofFilePath} target="_blank" className="text-sm underline text-slate-600">
                          View
                        </a>
                      ) : (
                        "—"
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          {allPayments.length === 0 && <EmptyState label="No payments recorded yet." />}
        </Card>
      </div>
    );
  }

  const sp = await searchParams;
  const preselectedOrderId = typeof sp.orderId === "string" ? sp.orderId : undefined;
  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;
  const isAdmin = user.role === "ADMIN";
  const canVerify = isAdmin || (await can(user, "PAYMENT_VERIFY"));
  const canReject = isAdmin || (await can(user, "PAYMENT_REJECT"));
  const canRecord = isAdmin || (await can(user, "PAYMENT_RECORD"));
  const canRecordHistorical = isAdmin || (await can(user, "PAYMENT_BACKDATE"));

  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const period = (typeof sp.period === "string" ? sp.period : "all") as PaymentFilterPeriod;

  const [summary, list, defaultOrderRow, settings] = await Promise.all([
    getPaymentsSummary(),
    getPaginatedPayments({
      page,
      pageSize: PAGE_SIZE,
      q: q || undefined,
      status: status === "PENDING" || status === "CONFIRMED" || status === "REJECTED" ? status : undefined,
      period,
    }),
    // Only the single preselected order (if any) is ever fetched here — the
    // full order list used to be loaded unconditionally for the old <Select>
    // dropdown; it's now fetched on demand, server-side, by the searchable
    // OrderCombobox (see app/actions/order-search.ts) instead.
    (canRecord || canRecordHistorical) && preselectedOrderId
      ? prisma.order.findUnique({ where: { id: preselectedOrderId }, include: { customer: true, quotation: true } })
      : Promise.resolve(null),
    getBusinessSettings(),
  ]);
  const { payments } = list;
  const defaultOrder = defaultOrderRow
    ? {
        id: defaultOrderRow.id,
        orderNumber: defaultOrderRow.orderNumber,
        customerName: defaultOrderRow.customer.name,
        customerPhone: defaultOrderRow.customer.contactNumber,
        quoteNumber: defaultOrderRow.quotation?.quoteNumber ?? null,
      }
    : null;
  // ProLine/Nextgen both use the icon-badge KPI treatment already
  // established on the admin dashboard (components/dashboard/admin-staff-
  // dashboard.tsx) — same theme check, not a separate convention.
  const showKpiIcons = settings.activeTheme === "nextgen" || settings.activeTheme === "proline";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
          <p className="text-sm text-slate-500">Manage and track all customer payments.</p>
        </div>
        <RecordPaymentModal defaultOrder={defaultOrder} canRecord={canRecord} canRecordHistorical={canRecordHistorical} />
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Total Paid (This Month)"
          value={formatCurrency(summary.totalPaidThisMonth)}
          href="/payments?period=monthly"
          icon={showKpiIcons ? Wallet : undefined}
          iconTone="green"
        />
        <KpiCard
          label="Payments (This Month)"
          value={summary.paymentsCountThisMonth}
          href="/payments?period=monthly"
          icon={showKpiIcons ? Receipt : undefined}
          iconTone="blue"
        />
        <KpiCard
          label="Outstanding Balance"
          value={formatCurrency(summary.outstandingBalance)}
          icon={showKpiIcons ? Clock : undefined}
          iconTone="orange"
        />
        <KpiCard
          label="Overdue Payments"
          value={summary.overduePaymentsCount}
          tone={summary.overduePaymentsCount > 0 ? "attention" : undefined}
          icon={showKpiIcons ? AlertTriangle : undefined}
          iconTone="red"
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <PaymentFilters q={q} status={status} period={period} />
          </div>
          <ExportPaymentsDialog q={q} status={status} period={period} />
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Order</TH>
                <TH>Customer</TH>
                <TH>Amount</TH>
                <TH>Method</TH>
                <TH>Status</TH>
                <TH>Payment Date</TH>
                <TH>Proof</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {payments.map((p) => {
                const confirm = confirmPaymentAction.bind(null, p.id);
                const reject = rejectPaymentAction.bind(null, p.id);
                return (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/orders/${p.orderId}`} className="font-medium text-slate-900 underline">
                        {p.order.orderNumber}
                      </Link>
                    </TD>
                    <TD>{p.order.customer.name}</TD>
                    <TD>{formatCurrency(p.amount.toString())}</TD>
                    <TD>{p.method.replace(/_/g, " ")}</TD>
                    <TD>
                      <StatusBadge status={p.status} />
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        {formatDateTime(p.paymentDate)}
                        {p.isHistorical && <Badge tone="yellow">Historical</Badge>}
                      </div>
                    </TD>
                    <TD>
                      {p.proofFilePath ? (
                        <a href={p.proofFilePath} target="_blank" className="text-sm underline text-slate-600">
                          View
                        </a>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      {p.status === "PENDING" && (canVerify || canReject) ? (
                        <div className="flex gap-2">
                          {canVerify && (
                            <form action={confirm}>
                              <Button type="submit" size="sm">
                                Confirm
                              </Button>
                            </form>
                          )}
                          {canReject && (
                            <form action={reject}>
                              <Button type="submit" size="sm" variant="destructive">
                                Reject
                              </Button>
                            </form>
                          )}
                        </div>
                      ) : (
                        <Link href={`/orders/${p.orderId}`} className="text-sm font-medium text-brand-600 underline">
                          View
                        </Link>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
        {payments.length === 0 && <EmptyState label="No payments match these filters." />}
        <PaymentsPagination page={list.page} totalPages={list.totalPages} total={list.total} pageSize={list.pageSize} searchParams={sp} />
      </Card>
    </div>
  );
}
