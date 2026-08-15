import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { sendQuotationAction, approveQuotationAction, rejectQuotationAction } from "@/app/actions/quotations";
import { RevisionRequestForm } from "./revision-request-form";
import { EditQuotationForm } from "./edit-quotation-form";
import { CancelQuotationForm } from "./cancel-quotation-form";
import { ForceApproveForm } from "./force-approve-form";
import { ConversationCard } from "@/components/messaging/conversation-card";

export default async function QuotationDetailPage({ params, searchParams }: PageProps<"/quotations/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      customer: true,
      lineItems: true,
      orders: true,
      inquiry: true,
      revisionRequests: { orderBy: { createdAt: "desc" } },
      cancelledBy: true,
      approvedByStaff: true,
      createdBy: true,
    },
  });
  if (!quotation) notFound();

  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (quotation.customerId !== customer.id) redirect("/quotations");
  }

  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;
  const send = sendQuotationAction.bind(null, quotation.id);
  const approve = approveQuotationAction.bind(null, quotation.id);
  const reject = rejectQuotationAction.bind(null, quotation.id);
  const hasOrder = quotation.orders.length > 0;
  const editable = ["DRAFT", "SENT", "REVISION_REQUESTED"].includes(quotation.status);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{quotation.quoteNumber}</h1>
          {isStaffLike && <p className="text-sm text-slate-500">{quotation.customer.name}</p>}
          <p className="text-xs text-slate-400">
            Prepared by {quotation.createdBy?.name ?? "—"} on {formatDateTime(quotation.createdAt)}
          </p>
        </div>
        <StatusBadge status={quotation.status} />
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      {quotation.status === "CANCELLED" && (
        <Alert tone="error">
          Cancelled by {quotation.cancelledBy?.name ?? "staff"}: {quotation.cancelReason}
        </Alert>
      )}
      {quotation.approvedByStaff && (
        <Alert tone="warning">
          Approved on the customer&apos;s behalf by {quotation.approvedByStaff.name} (rush): {quotation.approvalBypassReason}
        </Alert>
      )}

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

      {quotation.revisionRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Change requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quotation.revisionRequests.map((r) => (
              <div key={r.id} className="rounded bg-slate-50 p-2 text-sm">
                <p className="text-slate-800">{r.message}</p>
                <p className="mt-1 text-xs text-slate-400">{formatDateTime(r.createdAt)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {isStaffLike && (quotation.status === "DRAFT" || quotation.status === "REVISION_REQUESTED") && (
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
            <RevisionRequestForm quotationId={quotation.id} />
          </>
        )}
        {isStaffLike && quotation.status === "SENT" && (
          <p className="text-sm text-slate-500 self-center">Awaiting customer approval.</p>
        )}
        {isStaffLike && quotation.status === "SENT" && <ForceApproveForm quotationId={quotation.id} />}
        {isStaffLike && quotation.status === "APPROVED" && !hasOrder && (
          <Link href={`/orders/new?quotationId=${quotation.id}`}>
            <Button>Create Order</Button>
          </Link>
        )}
        {isStaffLike && editable && (
          <EditQuotationForm
            quotationId={quotation.id}
            lineItems={quotation.lineItems.map((li) => ({
              productType: li.productType,
              description: li.description,
              qty: li.qty,
              unitPrice: Number(li.unitPrice),
            }))}
            notes={quotation.notes}
          />
        )}
        {isStaffLike && editable && <CancelQuotationForm quotationId={quotation.id} />}
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

      <ConversationCard
        customerId={quotation.customerId}
        subjectType="QUOTATION"
        subjectId={quotation.id}
        currentUserId={user.id}
      />
    </div>
  );
}
