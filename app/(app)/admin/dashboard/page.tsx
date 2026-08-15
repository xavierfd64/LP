import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { OrdersByStatusChart, RevenueTrendChart, ProductionStatusChart } from "@/components/dashboard/admin-charts";

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** The last `n` calendar months, oldest first, ending with the current month — used to bucket the revenue/orders trend chart. */
function lastNMonths(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const offset = n - 1 - i;
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    return { label: start.toLocaleDateString("en-US", { month: "short" }), start, end };
  });
}

export default async function AdminDashboardPage() {
  await requireRole(["ADMIN"]);
  const monthStart = startOfMonth();
  const trendMonths = lastNMonths(6);
  const trendRangeStart = trendMonths[0].start;

  const [
    newInquiries,
    openQuotations,
    jobOrdersByStatus,
    qcResults,
    lowStockItems,
    openOrders,
    pendingPayments,
    upcomingFulfillments,
    newCustomersThisMonth,
    ordersThisMonthCustomerIds,
    rewardEarnedAgg,
    rewardRedeemedAgg,
    ordersByStatusRaw,
    trendPayments,
    trendOrders,
  ] = await Promise.all([
    prisma.inquiry.count({ where: { status: "NEW" } }),
    prisma.quotation.count({ where: { status: { in: ["DRAFT", "SENT"] } } }),
    prisma.jobOrder.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.qCResult.groupBy({ by: ["result"], _count: { _all: true } }),
    prisma.inventoryItem.findMany({ where: {}, orderBy: { name: "asc" } }).then((items) =>
      items.filter((i) => i.currentQty <= i.reorderThreshold)
    ),
    prisma.order.findMany({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      include: { customer: true, payments: { where: { status: "CONFIRMED" } } },
    }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.fulfillment.findMany({
      where: { status: { in: ["SCHEDULED", "BOOKED", "IN_TRANSIT"] } },
      include: { order: { include: { customer: true } }, jobOrder: true },
      orderBy: { scheduledDate: "asc" },
      take: 8,
    }),
    prisma.customer.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.order.findMany({ where: { createdAt: { gte: monthStart } }, select: { customerId: true }, distinct: ["customerId"] }),
    prisma.rewardTransaction.aggregate({ where: { type: "EARN", createdAt: { gte: monthStart } }, _sum: { points: true } }),
    prisma.rewardTransaction.aggregate({ where: { type: "REDEEM", createdAt: { gte: monthStart } }, _sum: { points: true } }),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.payment.findMany({
      where: { status: "CONFIRMED", paymentDate: { gte: trendRangeStart } },
      select: { paymentDate: true, amount: true },
    }),
    prisma.order.findMany({ where: { createdAt: { gte: trendRangeStart } }, select: { createdAt: true } }),
  ]);

  const ordersByStatusData = ordersByStatusRaw.map((s) => ({ status: s.status, count: s._count._all }));
  const productionStatusData = jobOrdersByStatus.map((s) => ({ status: s.status, count: s._count._all }));
  const revenueTrendData = trendMonths.map((m) => ({
    month: m.label,
    revenue: trendPayments
      .filter((p) => p.paymentDate >= m.start && p.paymentDate < m.end)
      .reduce((sum, p) => sum + Number(p.amount), 0),
    orders: trendOrders.filter((o) => o.createdAt >= m.start && o.createdAt < m.end).length,
  }));

  const qcPass = qcResults.find((r) => r.result === "PASS")?._count._all ?? 0;
  const qcFail = qcResults.find((r) => r.result === "FAIL")?._count._all ?? 0;
  const qcTotal = qcPass + qcFail;
  const qcPassRate = qcTotal > 0 ? Math.round((qcPass / qcTotal) * 100) : null;

  const ordersWithBalance = openOrders
    .map((o) => ({
      ...o,
      confirmed: o.payments.reduce((sum, p) => sum + Number(p.amount), 0),
    }))
    .filter((o) => Number(o.totalAmount) - o.confirmed > 0);
  const totalOutstanding = ordersWithBalance.reduce((sum, o) => sum + (Number(o.totalAmount) - o.confirmed), 0);

  const returningCustomersThisMonth = ordersThisMonthCustomerIds.length - newCustomersThisMonth >= 0
    ? Math.max(ordersThisMonthCustomerIds.length - newCustomersThisMonth, 0)
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Management Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="New Inquiries" value={newInquiries} href="/inquiries" tone={newInquiries > 0 ? "attention" : undefined} />
        <StatCard label="Open Quotations" value={openQuotations} href="/quotations" />
        <StatCard label="Pending Payments" value={pendingPayments} href="/payments" tone={pendingPayments > 0 ? "attention" : undefined} />
        <StatCard label="Outstanding Balance" value={formatCurrency(totalOutstanding)} href="/payments" />
        <StatCard label="QC Pass Rate" value={qcPassRate !== null ? `${qcPassRate}%` : "—"} sub={`${qcPass} pass / ${qcFail} fail`} />
        <StatCard label="Low-Stock Items" value={lowStockItems.length} href="/inventory" tone={lowStockItems.length > 0 ? "attention" : undefined} />
        <StatCard label="New Customers (mo.)" value={newCustomersThisMonth} />
        <StatCard label="Returning Customers (mo.)" value={returningCustomersThisMonth} />
        <StatCard label="Points Issued (mo.)" value={rewardEarnedAgg._sum.points ?? 0} href="/admin/rewards" />
        <StatCard label="Points Redeemed (mo.)" value={Math.abs(rewardRedeemedAgg._sum.points ?? 0)} href="/admin/rewards" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Orders by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <OrdersByStatusChart data={ordersByStatusData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue &amp; Orders Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={revenueTrendData} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Production Status Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductionStatusChart data={productionStatusData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Fulfillments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingFulfillments.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-sm">
                <div>
                  <Link href={`/job-orders/${f.jobOrderId}`} className="font-medium text-slate-900 underline">
                    {f.jobOrder?.joNumber}
                  </Link>
                  <span className="text-slate-500"> — {f.order.customer.name} ({f.method})</span>
                </div>
                <span className="text-slate-500">{formatDate(f.scheduledDate)}</span>
              </div>
            ))}
            {upcomingFulfillments.length === 0 && <p className="text-sm text-slate-400">Nothing scheduled.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Orders with an outstanding balance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {ordersWithBalance.map((o) => (
            <div key={o.id} className="flex items-center justify-between text-sm">
              <Link href={`/orders/${o.id}`} className="font-medium text-slate-900 underline">
                {o.orderNumber}
              </Link>
              <span className="text-slate-600">{o.customer.name}</span>
              <span className="font-medium text-yellow-700">{formatCurrency(Number(o.totalAmount) - o.confirmed)}</span>
            </div>
          ))}
          {ordersWithBalance.length === 0 && <p className="text-sm text-slate-400">All open orders are fully paid.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  tone?: "attention";
}) {
  const content = (
    <Card
      className={cn(
        "border-l-4 transition-shadow hover:shadow-md",
        tone === "attention" ? "border-l-amber-400" : "border-l-brand-600"
      )}
    >
      <CardContent className="py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
