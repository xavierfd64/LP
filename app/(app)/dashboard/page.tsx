import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireUser();

  if (user.role === "CUSTOMER") {
    return <CustomerDashboard userId={user.id} name={user.name ?? "there"} />;
  }

  const links = [
    { href: "/inquiries", label: "Inquiries" },
    { href: "/quotations", label: "Quotations" },
    { href: "/orders", label: "Orders" },
    { href: "/inventory", label: "Inventory" },
    { href: "/payments", label: "Payments" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome, {user.name}</h1>
        <p className="text-sm text-slate-500">Here&apos;s a quick jump-off point.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="py-6 text-center font-medium text-slate-800">{l.label}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

async function CustomerDashboard({ userId, name }: { userId: string; name: string }) {
  const customer = await getCurrentCustomer(userId);

  const [inquiries, quotationsAwaiting, activeOrders, allOrders] = await Promise.all([
    prisma.inquiry.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.quotation.findMany({ where: { customerId: customer.id, status: "SENT" }, orderBy: { createdAt: "desc" } }),
    prisma.order.findMany({
      where: { customerId: customer.id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      include: { jobOrders: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: { customerId: customer.id },
      include: { payments: { where: { status: "CONFIRMED" } } },
    }),
  ]);

  const balanceDue = allOrders.reduce((sum, o) => {
    const confirmed = o.payments.reduce((s, p) => s + Number(p.amount), 0);
    return sum + Math.max(Number(o.totalAmount) - confirmed, 0);
  }, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Welcome, {name}</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Link href="/quotations">
          <StatCard label="Quotations awaiting approval" value={quotationsAwaiting.length} tone={quotationsAwaiting.length > 0 ? "yellow" : undefined} />
        </Link>
        <Link href="/orders">
          <StatCard label="Active orders" value={activeOrders.length} />
        </Link>
        <Link href="/payments">
          <StatCard label="Balance due" value={formatCurrency(balanceDue)} tone={balanceDue > 0 ? "yellow" : undefined} />
        </Link>
        <Link href="/account/rewards">
          <StatCard label="Reward points" value={customer.rewardPointsBalance} />
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My active orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeOrders.map((o) => (
            <div key={o.id} className="rounded-md border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <Link href={`/orders/${o.id}`} className="font-medium text-slate-900 underline">
                  {o.orderNumber}
                </Link>
                <StatusBadge status={o.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {o.jobOrders.map((jo) => (
                  <span key={jo.id} className="inline-flex items-center gap-1 rounded bg-slate-50 px-2 py-1 text-xs">
                    {jo.joNumber} <StatusBadge status={jo.status} />
                  </span>
                ))}
              </div>
            </div>
          ))}
          {activeOrders.length === 0 && <p className="text-sm text-slate-400">No active orders right now.</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent inquiries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inquiries.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <Link href={`/inquiries/${i.id}`} className="underline">
                  {i.desiredProduct}
                </Link>
                <span className="flex items-center gap-2 text-slate-500">
                  {formatDate(i.createdAt)}
                  <StatusBadge status={i.status} />
                </span>
              </div>
            ))}
            {inquiries.length === 0 && <p className="text-sm text-slate-400">No inquiries yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quotations awaiting your approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quotationsAwaiting.map((q) => (
              <div key={q.id} className="flex items-center justify-between text-sm">
                <Link href={`/quotations/${q.id}`} className="underline font-medium">
                  {q.quoteNumber}
                </Link>
                <span className="text-slate-600">{formatCurrency(q.total.toString())}</span>
              </div>
            ))}
            {quotationsAwaiting.length === 0 && <p className="text-sm text-slate-400">Nothing pending.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: "yellow" }) {
  return (
    <Card className={tone === "yellow" ? "border-yellow-300 transition-shadow hover:shadow-md" : "transition-shadow hover:shadow-md"}>
      <CardContent className="py-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
