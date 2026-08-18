import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { KpiCard } from "./kpi-card";
import { NeedsAttention } from "./needs-attention";
import { FinancialOverview } from "./financial-overview";
import { ReceivablesList } from "./receivables-list";
import { ProductionToday } from "./production-today";
import { TodaysActivity } from "./todays-activity";
import { UpcomingFulfillments } from "./upcoming-fulfillments";
import { BusinessInsights } from "./business-insights";
import { QuickActionMenu, type QuickAction } from "./quick-action-menu";
import { OrdersByStatusChart, RevenueTrendChart } from "./admin-charts";
import { formatCurrency } from "@/lib/utils";
import {
  getPrimaryKpis,
  getNeedsAttention,
  getFinancialOverview,
  getReceivablesRequiringAttention,
  getProductionToday,
  getTodaysActivity,
  getUpcomingFulfillments,
  getBusinessInsights,
  getStatusCharts,
  getRevenueTrend6Months,
} from "@/lib/dashboard-data";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Shared by /admin/dashboard and Staff's /dashboard (spec item 37 — "the
 * same design system can be reused, but data and actions must continue
 * respecting permissions") — one dashboard, not two parallel
 * implementations. `canSeeFinancials` hides every money-related section
 * for a Staff account that hasn't been granted payment/reporting
 * permissions, mirroring the exact canSeeAmount precedent already used
 * on the Production Kanban for the PRODUCTION role.
 */
export async function AdminStaffDashboard({
  name,
  canSeeFinancials,
  canMessageCustomers,
  quickActions,
}: {
  name: string;
  canSeeFinancials: boolean;
  canMessageCustomers: boolean;
  quickActions: QuickAction[];
}) {
  const [kpis, needsAttention, financial, receivables, production, activity, upcoming, insights, charts, revenueTrend] = await Promise.all([
    getPrimaryKpis(),
    getNeedsAttention(),
    getFinancialOverview("month"),
    canSeeFinancials ? getReceivablesRequiringAttention() : Promise.resolve([]),
    getProductionToday(),
    getTodaysActivity(),
    getUpcomingFulfillments(),
    getBusinessInsights(),
    getStatusCharts(),
    canSeeFinancials ? getRevenueTrend6Months() : Promise.resolve([]),
  ]);

  const firstName = name.split(" ")[0];
  const todayLabel = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const salesTrend = kpis.salesChangePct === null ? undefined : `${kpis.salesChangePct >= 0 ? "↑" : "↓"} ${Math.abs(kpis.salesChangePct)}% vs yesterday`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{greeting()}, {firstName}!</h1>
          <p className="mt-1 text-sm text-slate-500">Here&apos;s what&apos;s happening with your business today.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">Today · {todayLabel}</span>
          <QuickActionMenu actions={quickActions} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Today's Sales" value={formatCurrency(kpis.todaySales)} sub={salesTrend} href={canSeeFinancials ? "/reports/summary" : undefined} />
        {canSeeFinancials && (
          <KpiCard
            label="Outstanding Balance"
            value={formatCurrency(kpis.outstandingBalance)}
            sub={`${kpis.outstandingCustomerCount} customer${kpis.outstandingCustomerCount === 1 ? "" : "s"}`}
            href="/payments"
          />
        )}
        <KpiCard label="Open Orders" value={kpis.openOrders} sub={`${kpis.inProductionCount} in production`} href="/orders" />
        {canSeeFinancials && (
          <KpiCard
            label="Pending Payments"
            value={kpis.pendingPaymentsCount}
            sub={formatCurrency(kpis.pendingPaymentsAmount)}
            href="/payments"
            tone={kpis.pendingPaymentsCount > 0 ? "attention" : undefined}
          />
        )}
        <KpiCard label="New Inquiries" value={kpis.newInquiries} sub="Today" href="/inquiries" tone={kpis.newInquiries > 0 ? "attention" : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <NeedsAttention items={needsAttention} />
        {canSeeFinancials ? <FinancialOverview initial={financial} /> : <div className="lg:col-span-2" />}
        {canSeeFinancials && <ReceivablesList rows={receivables} canMessage={canMessageCustomers} />}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProductionToday stages={production} />
        <TodaysActivity rows={activity} showAmounts={canSeeFinancials} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <SectionHeader title="Orders by Status" />
          </CardHeader>
          <CardContent>
            <OrdersByStatusChart data={charts.ordersByStatus} />
          </CardContent>
        </Card>
        {canSeeFinancials && (
          <Card>
            <CardHeader>
              <SectionHeader title="Revenue & Orders Trend" />
            </CardHeader>
            <CardContent>
              <RevenueTrendChart data={revenueTrend} />
            </CardContent>
          </Card>
        )}
        <BusinessInsights insights={insights} />
      </div>

      <UpcomingFulfillments buckets={upcoming} />
    </div>
  );
}
