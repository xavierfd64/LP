import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
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
import { DiscussInChatboxButton } from "@/components/messaging/discuss-in-chatbox-button";
import { TransactionBrandHeader } from "@/components/branding/transaction-brand-header";
import { DocumentShareManager } from "@/components/documents/document-share-manager";
import { findActiveShareLink } from "@/lib/document-sharing";
import { TrackingLinkManager } from "@/app/(app)/orders/[id]/tracking-link-manager";
import { findActiveTrackingLink } from "@/lib/order-tracking";

export default async function QuotationDetailPage({ params, searchParams }: PageProps<"/quotations/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      customer: true,
      lineItems: { include: { service: true } },
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
  } else if (user.role === "STAFF" && !(await can(user, "QUOTATION_VIEW"))) {
    redirect("/dashboard");
  }

  const isAdmin = user.role === "ADMIN";
  const canSend = isAdmin || (await can(user, "QUOTATION_SEND"));
  const canEdit = isAdmin || (await can(user, "QUOTATION_EDIT"));
  const canCancel = isAdmin || (await can(user, "QUOTATION_CANCEL"));
  const canForceApprove = isAdmin || (await can(user, "QUOTATION_APPROVE_REJECT"));
  const canCreateOrder = isAdmin || (await can(user, "ORDER_CREATE"));
  const canViewComms = isAdmin || (await can(user, "COMMUNICATION_VIEW"));
  const canShare = isAdmin || !isStaffLike || (await can(user, "DOCUMENT_SHARE"));
  const activeShareLink = canShare ? await findActiveShareLink("QUOTATION", quotation.id) : null;

  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;
  const send = sendQuotationAction.bind(null, quotation.id);
  const approve = approveQuotationAction.bind(null, quotation.id);
  const reject = rejectQuotationAction.bind(null, quotation.id);
  const hasOrder = quotation.orders.length > 0;
  const canManageTracking = isStaffLike && (isAdmin || (await can(user, "ORDER_TRACKING_MANAGE")));
  const activeTrackingLink = canManageTracking && hasOrder ? await findActiveTrackingLink(quotation.orders[0].id) : null;
  const editable = ["DRAFT", "SENT", "REVISION_REQUESTED"].includes(quotation.status);

  return (
    <div className="max-w-3xl space-y-6">
      <TransactionBrandHeader />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{quotation.quoteNumber}</h1>
          {isStaffLike && <p className="text-sm text-slate-500">{quotation.customer.name}</p>}
          <p className="text-xs text-slate-400">
            Prepared by {quotation.createdBy?.name ?? "—"} on {formatDateTime(quotation.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={quotation.status} />
          <Link href={`/quotations/${quotation.id}/print`} target="_blank">
            <Button type="button" variant="outline" size="sm">
              View Document
            </Button>
          </Link>
        </div>
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
        {isStaffLike && canSend && (quotation.status === "DRAFT" || quotation.status === "REVISION_REQUESTED") && (
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
        {isStaffLike && canForceApprove && quotation.status === "SENT" && <ForceApproveForm quotationId={quotation.id} />}
        {isStaffLike && canCreateOrder && quotation.status === "APPROVED" && !hasOrder && (
          <Link href={`/orders/new?quotationId=${quotation.id}`}>
            <Button>Create Order</Button>
          </Link>
        )}
        {isStaffLike && canEdit && editable && (
          <EditQuotationForm
            quotationId={quotation.id}
            lineItems={quotation.lineItems.map((li) => ({
              serviceId: li.serviceId ?? "",
              productType: li.productType,
              category: li.service?.category ?? null,
              specFields: (li.service?.specFields as string[]) ?? [],
              description: li.description,
              qty: li.qty,
              unitPrice: Number(li.unitPrice),
              specs: (li.specs as Record<string, string> | null) ?? null,
            }))}
            notes={quotation.notes}
          />
        )}
        {isStaffLike && canCancel && editable && <CancelQuotationForm quotationId={quotation.id} />}
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

      {(!isStaffLike || canViewComms) && (
        <DiscussInChatboxButton refType="QUOTATION" refId={quotation.id} label={quotation.quoteNumber} />
      )}

      {canShare && (
        <Card>
          <CardHeader>
            <CardTitle>Share Document</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentShareManager
              docType="QUOTATION"
              docId={quotation.id}
              isCustomer={!isStaffLike}
              activeLink={
                activeShareLink
                  ? {
                      id: activeShareLink.id,
                      token: activeShareLink.token,
                      accessLevel: activeShareLink.accessLevel,
                      expiresAt: activeShareLink.expiresAt ? activeShareLink.expiresAt.toISOString() : null,
                    }
                  : null
              }
            />
          </CardContent>
        </Card>
      )}

      {canManageTracking && hasOrder && (
        <Card>
          <CardHeader>
            <CardTitle>Customer Tracking Link</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-slate-500">
              Tracking follows the order created from this quotation — the same link customers can use from the order itself.
            </p>
            <TrackingLinkManager
              orderId={quotation.orders[0].id}
              activeLink={
                activeTrackingLink
                  ? {
                      id: activeTrackingLink.id,
                      token: activeTrackingLink.token,
                      expiresAt: activeTrackingLink.expiresAt ? activeTrackingLink.expiresAt.toISOString() : null,
                    }
                  : null
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
