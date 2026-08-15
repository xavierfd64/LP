import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default async function AdminDashboardPage() {
  await requireRole(["ADMIN"]);
  const monthStart = startOfMonth();

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
  ]);

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

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Job Orders by Stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobOrdersByStatus.map((s) => (
              <div key={s.status} className="flex items-center justify-between text-sm">
                <Badge tone="slate">{s.status.replace(/_/g, " ")}</Badge>
                <span className="font-medium text-slate-900">{s._count._all}</span>
              </div>
            ))}
            {jobOrdersByStatus.length === 0 && <p className="text-sm text-slate-400">No job orders yet.</p>}
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
