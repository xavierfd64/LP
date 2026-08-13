import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { confirmPaymentAction, rejectPaymentAction } from "@/app/actions/payments";
import { PaymentForm } from "./payment-form";

export default async function PaymentsPage() {
  await requireRole(["STAFF", "ADMIN"]);

  const [payments, orders] = await Promise.all([
    prisma.payment.findMany({
      include: { order: { include: { customer: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Payments</h1>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>All payments</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Order</TH>
                <TH>Customer</TH>
                <TH>Amount</TH>
                <TH>Method</TH>
                <TH>Status</TH>
                <TH>Date</TH>
                <TH>Proof</TH>
                <TH />
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
                    <TD>{formatDateTime(p.createdAt)}</TD>
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
                      {p.status === "PENDING" && (
                        <div className="flex gap-2">
                          <form action={confirm}>
                            <Button type="submit" size="sm">
                              Confirm
                            </Button>
                          </form>
                          <form action={reject}>
                            <Button type="submit" size="sm" variant="destructive">
                              Reject
                            </Button>
                          </form>
                        </div>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {payments.length === 0 && <EmptyState label="No payments recorded yet." />}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Record a payment</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentForm
              orders={orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, customerName: o.customer.name }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
