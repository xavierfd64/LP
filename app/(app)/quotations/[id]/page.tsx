import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { sendQuotationAction, approveQuotationAction, rejectQuotationAction } from "@/app/actions/quotations";

export default async function QuotationDetailPage({ params }: PageProps<"/quotations/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: { customer: true, lineItems: true, orders: true, inquiry: true },
  });
  if (!quotation) notFound();

  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (quotation.customerId !== customer.id) redirect("/quotations");
  }

  const send = sendQuotationAction.bind(null, quotation.id);
  const approve = approveQuotationAction.bind(null, quotation.id);
  const reject = rejectQuotationAction.bind(null, quotation.id);
  const hasOrder = quotation.orders.length > 0;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{quotation.quoteNumber}</h1>
          {isStaffLike && <p className="text-sm text-slate-500">{quotation.customer.name}</p>}
        </div>
        <StatusBadge status={quotation.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Product</TH>
              <TH>Description</TH>
              <TH>Qty</TH>
              <TH>Unit price</TH>
              <TH>Subtotal</TH>
            </TR>
          </THead>
          <TBody>
            {quotation.lineItems.map((li) => (
              <TR key={li.id}>
                <TD>{li.productType}</TD>
                <TD>{li.description}</TD>
                <TD>{li.qty}</TD>
                <TD>{formatCurrency(li.unitPrice.toString())}</TD>
                <TD>{formatCurrency(Number(li.unitPrice) * li.qty)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <CardContent className="flex justify-between border-t border-slate-100 text-sm">
          <span className="text-slate-500">
            {quotation.validUntil ? `Valid until ${formatDate(quotation.validUntil)}` : ""}
          </span>
          <span className="text-base font-semibold text-slate-900">
            Total: {formatCurrency(quotation.total.toString())}
          </span>
        </CardContent>
      </Card>

      {quotation.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700 whitespace-pre-wrap">{quotation.notes}</CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {isStaffLike && quotation.status === "DRAFT" && (
          <form action={send}>
            <Button type="submit">Send to Customer</Button>
          </form>
        )}
        {!isStaffLike && quotation.status === "SENT" && (
          <>
            <form action={approve}>
              <Button type="submit">Approve</Button>
            </form>
            <form action={reject}>
              <Button type="submit" variant="destructive">
                Reject
              </Button>
            </form>
          </>
        )}
        {isStaffLike && quotation.status === "SENT" && (
          <p className="text-sm text-slate-500 self-center">Awaiting customer approval.</p>
        )}
        {isStaffLike && quotation.status === "APPROVED" && !hasOrder && (
          <Link href={`/orders/new?quotationId=${quotation.id}`}>
            <Button>Create Order</Button>
          </Link>
        )}
      </div>

      {hasOrder && (
        <Card>
          <CardHeader>
            <CardTitle>Linked order</CardTitle>
          </CardHeader>
          <CardContent>
            {quotation.orders.map((o) => (
              <Link key={o.id} href={`/orders/${o.id}`} className="text-sm font-medium text-slate-900 underline">
                {o.orderNumber}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
