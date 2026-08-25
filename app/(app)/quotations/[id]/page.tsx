import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { EditorShell, EditorHeader, EditorGrid, EditorPanel, InfoField, TotalsPanel } from "@/components/documents/editor-shell";
import { LineItemsView } from "@/components/documents/line-items-view";
import { InternalCostingPanel } from "@/components/documents/internal-costing-panel";
import { estimateCostForLines } from "@/lib/service-cost";
import { sendQuotationAction, restoreQuotationAction } from "@/app/actions/quotations";
import { RevisionRequestForm } from "./revision-request-form";
import { EditQuotationForm } from "./edit-quotation-form";
import { CancelQuotationForm } from "./cancel-quotation-form";
import { ForceApproveForm } from "./force-approve-form";
import { CustomerQuotationActions } from "./customer-quotation-actions";
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
  const canViewCost = isStaffLike && (isAdmin || (await can(user, "COST_VIEW")));
  const costEstimate = canViewCost
    ? await estimateCostForLines(
        quotation.lineItems.map((li) => ({ serviceId: li.serviceId, qty: li.qty, sellingAmount: Number(li.unitPrice) * li.qty }))
      )
    : null;

  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;
  const send = sendQuotationAction.bind(null, quotation.id);
  const hasOrder = quotation.orders.length > 0;
  const canManageTracking = isStaffLike && (isAdmin || (await can(user, "ORDER_TRACKING_MANAGE")));
  const activeTrackingLink = canManageTracking && hasOrder ? await findActiveTrackingLink(quotation.orders[0].id) : null;
  const editable = ["DRAFT", "SENT", "REVISION_REQUESTED"].includes(quotation.status);

  const totalsRows = quotation.subtotal != null
    ? [
        { label: "Subtotal", value: formatCurrency(quotation.subtotal.toString()) },
        ...(Number(quotation.discountAmount) > 0
          ? [{ label: quotation.discountLabel ?? "Discount", value: formatCurrency(quotation.discountAmount.toString()), negative: true }]
          : []),
        ...(Number(quotation.taxAmount) > 0 ? [{ label: "Tax / VAT", value: formatCurrency(quotation.taxAmount.toString()) }] : []),
      ]
    : [];

  return (
    <EditorShell>
      <TransactionBrandHeader />
      <EditorHeader
        eyebrow="Quotation"
        title={quotation.quoteNumber}
        subtitle={
          <>
            {isStaffLike && <span>{quotation.customer.name} · </span>}
            Prepared by {quotation.createdBy?.name ?? "—"} on {formatDateTime(quotation.createdAt)}
          </>
        }
        status={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={quotation.status} />
            {quotation.isInstant && <Badge tone="blue">Instant Quotation</Badge>}
          </div>
        }
        actions={
          <Link href={`/quotations/${quotation.id}/print`} target="_blank">
            <Button type="button" variant="outline" size="sm">
              View Document
            </Button>
          </Link>
        }
      />

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      {quotation.status === "CANCELLED" && (
        <Alert tone="error">
          Cancelled by {quotation.cancelledBy?.name ?? "staff"}: {quotation.cancelReason}
        </Alert>
      )}
      {quotation.status === "REJECTED" && quotation.rejectReason && (
        <Alert tone="error">Reason: {quotation.rejectReason}</Alert>
      )}
      {quotation.status === "SENT" && quotation.validUntil && quotation.validUntil < new Date() && (
        <Alert tone="warning">This quotation&apos;s validity period has passed — please contact us for an updated quote.</Alert>
      )}
      {quotation.approvedByStaff && (
        <Alert tone="warning">
          Approved on the customer&apos;s behalf by {quotation.approvedByStaff.name} (rush): {quotation.approvalBypassReason}
        </Alert>
      )}

      <EditorGrid>
        <EditorPanel title="Customer Information">
          <div className="grid grid-cols-2 gap-3">
            <InfoField label="Customer" value={quotation.customer.name} />
            <InfoField label="Company" value={quotation.customer.companyName} />
            <InfoField label="Email" value={quotation.customer.email} />
            <InfoField label="Contact" value={quotation.customer.contactNumber} />
          </div>
        </EditorPanel>
        <EditorPanel title="Document Information">
          <div className="grid grid-cols-2 gap-3">
            <InfoField label="Quotation No." value={quotation.quoteNumber} />
            <InfoField label="Date" value={formatDate(quotation.createdAt)} />
            <InfoField label="Valid Until" value={quotation.validUntil ? formatDate(quotation.validUntil) : "—"} />
            <InfoField label="Status" value={<StatusBadge status={quotation.status} />} />
          </div>
        </EditorPanel>
      </EditorGrid>

      <EditorPanel title="Line Items">
        <LineItemsView
          items={quotation.lineItems.map((li) => ({ id: li.id, productType: li.productType, description: li.description, qty: li.qty, unit: li.unit, unitPrice: li.unitPrice.toString() }))}
        />
        <TotalsPanel rows={totalsRows} total={{ label: "Total", value: formatCurrency(quotation.total.toString()) }} />
      </EditorPanel>

      {costEstimate && <InternalCostingPanel estimate={costEstimate} title="Quotation Costing" />}

      {quotation.notes && (
        <EditorPanel title="Notes">
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{quotation.notes}</p>
        </EditorPanel>
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
            <CustomerQuotationActions
              quotationId={quotation.id}
              quoteNumber={quotation.quoteNumber}
              lineItems={quotation.lineItems.map((li) => ({
                id: li.id,
                productType: li.productType,
                description: li.description,
                qty: li.qty,
                unitPrice: Number(li.unitPrice),
              }))}
              notes={quotation.notes}
            />
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
        {isStaffLike && canCancel && quotation.status === "CANCELLED" && (
          <form action={restoreQuotationAction.bind(null, quotation.id)}>
            <Button type="submit" variant="outline">
              Restore Quotation
            </Button>
          </form>
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
    </EditorShell>
  );
}
