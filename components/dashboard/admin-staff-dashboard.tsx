import { Wallet, Inbox, FileText, ShoppingCart, Boxes } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { KpiCard } from "./kpi-card";
import { NeedsAttention } from "./needs-attention";
import { FinancialOverview } from "./financial-overview";
import { FinancialFoundationCard } from "./financial-foundation-card";
import { ReceivablesList } from "./receivables-list";
import { ProductionToday } from "./production-today";
import { TodaysActivity } from "./todays-activity";
import { UpcomingFulfillments } from "./upcoming-fulfillments";
import { BusinessInsights } from "./business-insights";
import { QuickActionMenu, type QuickAction } from "./quick-action-menu";
import { RecentTransactionsCard } from "./recent-transactions-card";
import { InventoryStockLevelsTable } from "./inventory-stock-levels-table";
import { ServiceCostBreakdownCard } from "./service-cost-breakdown-card";
import {
  OrdersByStatusChart,
  RevenueTrendChart,
  SalesOverviewChart,
  TopServicesRevenueChart,
  MonthlyPLChart,
  PaymentMethodsDonutChart,
} from "./admin-charts";
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
  getVolumeKpis,
  getSalesOverviewWeekly,
  getTopServicesByRevenue,
  getServiceCostBreakdownForDashboard,
  getMonthlyPL,
  getPaymentMethodsBreakdown,
  getInventoryStockLevelsTop5,
  getRecentTransactionsTabbed,
} from "@/lib/dashboard-data";
import { resolvePeriodRange } from "@/lib/transaction-summary";
import { computeFinancialFoundation } from "@/lib/financial-summary";

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
  canSendQuotation,
  canRecordPayment,
}: {
  name: string;
  canSeeFinancials: boolean;
  canMessageCustomers: boolean;
  quickActions: QuickAction[];
  canSendQuotation: boolean;
  canRecordPayment: boolean;
}) {
  const [
    kpis, needsAttention, financial, receivables, production, activity, upcoming, insights, charts, revenueTrend, financialFoundation,
    volumeKpis, salesOverview, topServices, serviceCostBreakdown, monthlyPL, paymentMethods, stockLevels, recentTransactions,
  ] = await Promise.all([
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
    canSeeFinancials ? computeFinancialFoundation(resolvePeriodRange({ type: "monthly" })) : Promise.resolve(null),
    getVolumeKpis(),
    canSeeFinancials ? getSalesOverviewWeekly() : Promise.resolve([]),
    canSeeFinancials ? getTopServicesByRevenue() : Promise.resolve([]),
    canSeeFinancials ? getServiceCostBreakdownForDashboard() : Promise.resolve(null),
    canSeeFinancials ? getMonthlyPL() : Promise.resolve(null),
    canSeeFinancials ? getPaymentMethodsBreakdown() : Promise.resolve([]),
    getInventoryStockLevelsTop5(),
    getRecentTransactionsTabbed(),
  ]);

  const firstName = name.split(" ")[0];
  const todayLabel = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const salesTrend = kpis.salesChangePct === null ? undefined : `${kpis.salesChangePct >= 0 ? "↑" : "↓"} ${Math.abs(kpis.salesChangePct)}% vs yesterday`;
  const trendSub = (pct: number | null, unit = "vs last month") =>
    pct === null ? undefined : `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct)}% ${unit}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{greeting()}, {firstName}! 👋</h1>
          <p className="mt-1 text-sm text-slate-500">Here&apos;s what&apos;s happening with your business today.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">Today · {todayLabel}</span>
          <QuickActionMenu actions={quickActions} canSend={canSendQuotation} />
        </div>
      </div>

      {/* Whiskey dashboard reference's 5 "Total X" volume KPIs (Inquiries/
          Quotations/Orders/Payments/Inventory Items), each with a real
          vs-last-month trend and a real weekly sparkline — replaces the
          previous "today snapshot" KPI row; that same information
          (today's sales, outstanding balance, pending payments, new
          inquiries) is still shown below in Financial Overview/Needs
          Attention/Receivables, just no longer duplicated at the top. */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Total Inquiries"
          value={volumeKpis.inquiries.value}
          sub={trendSub(volumeKpis.inquiries.changePct)}
          href="/inquiries"
          icon={Inbox}
          iconTone="blue"
          spark={volumeKpis.inquiries.weekly}
        />
        <KpiCard
          label="Total Quotations"
          value={volumeKpis.quotations.value}
          sub={trendSub(volumeKpis.quotations.changePct)}
          href="/quotations"
          icon={FileText}
          iconTone="purple"
          spark={volumeKpis.quotations.weekly}
        />
        <KpiCard
          label="Total Orders"
          value={volumeKpis.orders.value}
          sub={trendSub(volumeKpis.orders.changePct)}
          href="/orders"
          icon={ShoppingCart}
          iconTone="green"
          spark={volumeKpis.orders.weekly}
        />
        {canSeeFinancials && (
          <KpiCard
            label="Total Payments"
            value={formatCurrency(volumeKpis.payments.value)}
            sub={trendSub(volumeKpis.payments.changePct)}
            href="/payments"
            icon={Wallet}
            iconTone="red"
            spark={volumeKpis.payments.weekly}
          />
        )}
        <KpiCard
          label="Inventory Items"
          value={volumeKpis.inventoryItems.value}
          sub={trendSub(volumeKpis.inventoryItems.changePct)}
          href="/inventory"
          icon={Boxes}
          iconTone="orange"
          spark={volumeKpis.inventoryItems.weekly}
        />
      </div>

      {/* Analytics row — Sales Overview / Orders by Status / Top Services by Revenue (Whiskey dashboard reference). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {canSeeFinancials && (
          <Card>
            <CardHeader>
              <SectionHeader title="Sales Overview" subtitle="Total sales, payments and outstanding balance" />
            </CardHeader>
            <CardContent>
              <SalesOverviewChart data={salesOverview} />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <SectionHeader title="Orders by Status" subtitle="Current order distribution" />
          </CardHeader>
          <CardContent>
            <OrdersByStatusChart data={charts.ordersByStatus} variant="donut" />
          </CardContent>
        </Card>
        {canSeeFinancials && (
          <Card>
            <CardHeader>
              <SectionHeader title="Top Services by Revenue" subtitle="Based on confirmed orders" />
            </CardHeader>
            <CardContent>
              <TopServicesRevenueChart data={topServices} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Operations/costing row — Inventory Stock Levels / Service Cost Breakdown / Monthly P&L (Whiskey dashboard reference). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InventoryStockLevelsTable items={stockLevels} viewAllHref="/inventory" />
        {canSeeFinancials && <ServiceCostBreakdownCard breakdown={serviceCostBreakdown} configureHref="/admin/services" />}
        {canSeeFinancials && monthlyPL && (
          <Card>
            <CardHeader>
              <SectionHeader title="Monthly Profit & Loss" subtitle="Revenue vs expenses" />
            </CardHeader>
            <CardContent>
              <MonthlyPLChart {...monthlyPL} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Lower row — Recent Transactions / Payment Methods (Whiskey dashboard reference). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentTransactionsCard data={recentTransactions} viewAllHref="/reports/summary" showAmounts={canSeeFinancials} />
        </div>
        {canSeeFinancials && (
          <Card>
            <CardHeader>
              <SectionHeader title="Payment Methods" subtitle="Confirmed payments this month" />
            </CardHeader>
            <CardContent>
              <PaymentMethodsDonutChart data={paymentMethods} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Existing operational widgets — unchanged, just relocated below the
          Whiskey reference's structure rather than removed (spec item 20:
          "do not remove information"). Today's Sales/Outstanding
          Balance/Pending Payments/New Inquiries all still live here. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <NeedsAttention items={needsAttention} />
        {canSeeFinancials ? <FinancialOverview initial={financial} /> : <div className="lg:col-span-2" />}
        {canSeeFinancials && <ReceivablesList rows={receivables} canMessage={canMessageCustomers} canRecordPayment={canRecordPayment} />}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {canSeeFinancials && financialFoundation && <FinancialFoundationCard fin={financialFoundation} />}
        <ProductionToday stages={production} />
        <TodaysActivity rows={activity} showAmounts={canSeeFinancials} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {canSeeFinancials && (
          <Card>
            <CardHeader>
              <SectionHeader title="Revenue & Orders Trend" subtitle="Last 6 months" />
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
