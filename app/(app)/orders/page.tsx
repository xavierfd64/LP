import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function OrdersPage() {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const where = isStaffLike ? {} : { customerId: (await getCurrentCustomer(user.id)).id };

  const orders = await prisma.order.findMany({
    where,
    include: { customer: true, jobOrders: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isStaffLike ? "Orders" : "My Orders"}</h1>
          <p className="text-sm text-slate-500">Track job orders, payments, and fulfillment.</p>
        </div>
        {isStaffLike && (
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
                <TD>
                  <Link href={`/orders/${o.id}`} className="text-sm font-medium text-slate-900 underline">
                    View
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {orders.length === 0 && <EmptyState label="No orders yet." />}
      </Card>
    </div>
  );
}
