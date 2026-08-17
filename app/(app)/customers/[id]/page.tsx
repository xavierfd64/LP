import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EditCustomerForm } from "./edit-customer-form";
import { ActivateLoginForm } from "./activate-login-form";

export default async function CustomerDetailPage({ params }: PageProps<"/customers/[id]">) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "CUSTOMER_VIEW"))) redirect("/dashboard");
  const canEdit = user.role === "ADMIN" || (await can(user, "CUSTOMER_EDIT"));

  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, active: true, createdAt: true } },
      inquiries: { orderBy: { createdAt: "desc" }, take: 5 },
      quotations: { orderBy: { createdAt: "desc" }, take: 5 },
      orders: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!customer) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
          <p className="text-sm text-slate-500">{customer.displayId}</p>
        </div>
        <Badge tone={customer.userId ? "green" : "slate"}>
          Login Status: {customer.userId ? "Activated" : "Not Activated"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <EditCustomerForm customer={customer} />
            ) : (
              <dl className="space-y-2 text-sm">
                <Field label="Company" value={customer.companyName} />
                <Field label="Address" value={customer.address} />
                <Field label="Email" value={customer.email ?? customer.user?.email ?? null} />
                <Field label="Contact Number" value={customer.contactNumber} />
                <Field label="Facebook" value={customer.facebookUrl} />
                <Field label="Reward points" value={String(customer.rewardPointsBalance)} />
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Login Account</CardTitle>
          </CardHeader>
          <CardContent>
            {customer.userId ? (
              <div className="space-y-1 text-sm">
                <p className="text-slate-700">
                  Activated with <span className="font-medium">{customer.user?.email}</span>
                </p>
                <Badge tone={customer.user?.active ? "green" : "red"}>
                  {customer.user?.active ? "Active" : "Deactivated"}
                </Badge>
              </div>
            ) : canEdit ? (
              <ActivateLoginForm customerId={customer.id} />
            ) : (
              <p className="text-sm text-slate-400">
                This customer has no login account yet. This record still supports full transaction history with
                zero login access.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Quotations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {customer.quotations.map((q) => (
            <div key={q.id} className="flex items-center justify-between text-sm">
              <Link href={`/quotations/${q.id}`} className="font-medium underline">
                {q.quoteNumber}
              </Link>
              <span className="flex items-center gap-2 text-slate-500">
                {formatCurrency(q.total.toString())}
                <StatusBadge status={q.status} />
              </span>
            </div>
          ))}
          {customer.quotations.length === 0 && <p className="text-sm text-slate-400">No quotations yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {customer.orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between text-sm">
              <Link href={`/orders/${o.id}`} className="font-medium underline">
                {o.orderNumber}
              </Link>
              <span className="flex items-center gap-2 text-slate-500">
                {formatCurrency(o.totalAmount.toString())}
                <StatusBadge status={o.status} />
              </span>
            </div>
          ))}
          {customer.orders.length === 0 && <p className="text-sm text-slate-400">No orders yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Inquiries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {customer.inquiries.map((i) => (
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
          {customer.inquiries.length === 0 && <p className="text-sm text-slate-400">No inquiries yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-900">{value || "—"}</dd>
    </div>
  );
}
