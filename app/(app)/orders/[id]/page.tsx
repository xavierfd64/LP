import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { paymentSummary } from "@/lib/workflow";
import { AddJobOrderForm } from "./add-jo-form";
import { startProductionAction } from "@/app/actions/orders";

export default async function OrderDetailPage({
  params,
  searchParams,
}: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      quotation: true,
      jobOrders: { include: { workflowTemplate: true }, orderBy: { joNumber: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();

  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (order.customerId !== customer.id) redirect("/orders");
  }

  const summary = await paymentSummary(order.id);
  const templates = isStaffLike
    ? await prisma.workflowTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } })
    : [];

  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{order.orderNumber}</h1>
          {isStaffLike && <p className="text-sm text-slate-500">{order.customer.name}</p>}
        </div>
        <StatusBadge status={order.status} />
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Payment terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-slate-500">Type: </span>
              <span className="font-medium">{order.paymentTermType.replace(/_/g, " ")}</span>
            </p>
            {order.paymentTermType === "APPROVED_TERMS" && (
              <>
                <p>
                  <span className="text-slate-500">Authorized by: </span>
                  {order.termsApprovedBy}
                </p>
                <p>
                  <span className="text-slate-500">Reason: </span>
                  {order.termsReason}
                </p>
              </>
            )}
            {order.paymentTermType === "STANDARD_PARTIAL" && (
              <p>
                <span className="text-slate-500">Required partial: </span>
                {order.requiredPartialPct}% ({formatCurrency(summary.requiredPartial)})
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payment status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-slate-500">Total: </span>
              {formatCurrency(summary.total)}
            </p>
            <p>
              <span className="text-slate-500">Confirmed: </span>
              {formatCurrency(summary.confirmed)}
            </p>
            <p className="font-medium">
              {summary.fullyPaid ? (
                <span className="text-green-700">Fully paid</span>
              ) : summary.partialMet || summary.hasApprovedTerms ? (
                <span className="text-blue-700">Cleared for production</span>
              ) : (
                <span className="text-yellow-700">Awaiting partial payment</span>
              )}
            </p>
            <Link href="/payments" className="text-sm underline text-slate-600">
              View / record payments →
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Job Orders</CardTitle>
          {isStaffLike && <AddJobOrderForm orderId={order.id} templates={templates} />}
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>JO #</TH>
              <TH>Product</TH>
              <TH>Qty</TH>
              <TH>Template</TH>
              <TH>Status</TH>
              <TH>Deadline</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {order.jobOrders.map((jo) => {
              const start = startProductionAction.bind(null, jo.id);
              return (
                <TR key={jo.id}>
                  <TD className="font-medium text-slate-900">{jo.joNumber}</TD>
                  <TD>{jo.productType}</TD>
                  <TD>{jo.quantity}</TD>
                  <TD>{jo.workflowTemplate.name}</TD>
                  <TD>
                    <StatusBadge status={jo.status} />
                  </TD>
                  <TD>{formatDate(jo.deadline)}</TD>
                  <TD className="flex items-center gap-2">
                    <Link href={`/job-orders/${jo.id}`} className="text-sm font-medium text-slate-900 underline">
                      View
                    </Link>
                    {isStaffLike && jo.status === "ON_HOLD" && (
                      <form action={start}>
                        <Button type="submit" size="sm" variant="outline">
                          Start Production
                        </Button>
                      </form>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {order.jobOrders.length === 0 && <EmptyState label="No job orders yet." />}
      </Card>
    </div>
  );
}
