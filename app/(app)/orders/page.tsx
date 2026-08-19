import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { TransactionBrandHeader } from "@/components/branding/transaction-brand-header";

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (user.role === "STAFF" && !(await can(user, "ORDER_VIEW"))) redirect("/dashboard");
  const canCreate = user.role === "ADMIN" || (await can(user, "ORDER_CREATE"));

  // Distinct nav identity for the Customer sidebar's "Invoices" item (spec
  // Aug 19 corrective update, item 2) — same underlying Order records (this
  // app has no separate Invoice entity), but the heading and each row's
  // link reflect the invoice framing rather than the order-tracking one.
  const sp = await searchParams;
  const isInvoicesView = !isStaffLike && sp.view === "invoices";

  const where = isStaffLike ? {} : { customerId: (await getCurrentCustomer(user.id)).id };

  const orders = await prisma.order.findMany({
    where,
    include: { customer: true, jobOrders: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <TransactionBrandHeader />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isStaffLike ? "Orders" : isInvoicesView ? "Invoices" : "My Orders"}
          </h1>
          <p className="text-sm text-slate-500">
            {isInvoicesView ? "Printable invoices for each of your orders." : "Track job orders, payments, and fulfillment."}
          </p>
        </div>
        {isStaffLike && canCreate && (
          <Link href="/orders/new">
            <Button>New Order</Button>
          </Link>
        )}
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Order #</TH>
              {isStaffLike && <TH>Customer</TH>}
              <TH>Job Orders</TH>
              <TH>Total</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {orders.map((o) => (
              <TR key={o.id}>
                <TD className="font-medium text-slate-900">{o.orderNumber}</TD>
                {isStaffLike && <TD>{o.customer.name}</TD>}
                <TD>{o.jobOrders.length}</TD>
                <TD>{formatCurrency(o.totalAmount.toString())}</TD>
                <TD>
                  <StatusBadge status={o.status} />
                </TD>
                <TD>{formatDate(o.createdAt)}</TD>
                <TD className="flex items-center gap-3">
                  <Link href={`/orders/${o.id}`} className="text-sm font-medium text-slate-900 underline">
                    View
                  </Link>
                  {isInvoicesView && (
                    <Link href={`/orders/${o.id}/invoice`} target="_blank" className="text-sm font-medium text-brand-600 underline">
                      Invoice
                    </Link>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {orders.length === 0 && <EmptyState label={isInvoicesView ? "No invoices yet." : "No orders yet."} />}
      </Card>
    </div>
  );
}
