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
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { paymentSummary } from "@/lib/workflow";
import { AddJobOrderForm } from "./add-jo-form";
import { startProductionAction } from "@/app/actions/orders";
import { releaseJobOrderAction, sendBalanceReminderAction } from "@/app/actions/payments";
import { PaymentProofForm } from "./payment-proof-form";
import { ReleaseExceptionForm } from "./release-exception-form";
import { ApplyVoucherForm } from "./apply-voucher-form";
import { MessageThread } from "@/components/messaging/message-thread";
import { getOrCreateConversation } from "@/lib/conversations";
import { getConversationMessagesAction } from "@/app/actions/messages";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { TransactionBrandHeader } from "@/components/branding/transaction-brand-header";
import { TrackingLinkManager } from "./tracking-link-manager";
import { findActiveTrackingLink } from "@/lib/order-tracking";
import { DocumentShareManager } from "@/components/documents/document-share-manager";
import { findActiveShareLink } from "@/lib/document-sharing";

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
      fulfillments: { orderBy: { createdAt: "desc" }, include: { jobOrder: true } },
    },
  });
  if (!order) notFound();

  let availableVouchers: { id: string; code: string; value: number; minimumSpend: number }[] = [];
  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (order.customerId !== customer.id) redirect("/orders");
    const vouchers = await prisma.voucher.findMany({
      where: { customerId: customer.id, status: "AVAILABLE", minimumSpend: { lte: Number(order.totalAmount) } },
      orderBy: { createdAt: "desc" },
    });
    availableVouchers = vouchers;
  } else if (user.role === "STAFF" && !(await can(user, "ORDER_VIEW"))) {
    redirect("/dashboard");
  }

  const isAdmin = user.role === "ADMIN";
  const canModifyOrder = isAdmin || (await can(user, "ORDER_MODIFY"));
  const canRecordPayment = isAdmin || (await can(user, "PAYMENT_RECORD"));
  const canViewPayments = isAdmin || (await can(user, "PAYMENT_VIEW"));
  const canStartProduction = isAdmin || (await can(user, "PRODUCTION_UPDATE_STAGE"));
  const canViewComms = isAdmin || (await can(user, "COMMUNICATION_VIEW"));
  const canManageTracking = isAdmin || (await can(user, "ORDER_TRACKING_MANAGE"));
  const canShare = isAdmin || !isStaffLike || (await can(user, "DOCUMENT_SHARE"));

  const summary = await paymentSummary(order.id);
  const templates = isStaffLike
    ? await prisma.workflowTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } })
    : [];

  const activeTrackingLink =
    isStaffLike && canManageTracking ? await findActiveTrackingLink(order.id) : null;
  const activeShareLink = canShare ? await findActiveShareLink("INVOICE", order.id) : null;

  const conversation = await getOrCreateConversation(order.customerId, "ORDER", order.id);
  const commsData = !isStaffLike || canViewComms ? await getConversationMessagesAction(conversation.id) : null;

  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <div className="max-w-4xl space-y-6">
      <TransactionBrandHeader />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{order.orderNumber}</h1>
          {isStaffLike && <p className="text-sm text-slate-500">{order.customer.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} />
          <Link href={`/orders/${order.id}/invoice`} target="_blank">
            <Button type="button" variant="outline" size="sm">
              View Invoice
            </Button>
          </Link>
        </div>
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            {isStaffLike && canRecordPayment && !summary.fullyPaid && (
              <RecordPaymentDialog
                orderId={order.id}
                orderNumber={order.orderNumber}
                customerName={order.customer.name}
                balanceDue={summary.total - summary.confirmed}
              />
            )}
            <div className="pt-2 flex flex-col gap-2 items-start">
              {!isStaffLike && !summary.fullyPaid && <PaymentProofForm orderId={order.id} />}
              {!isStaffLike && !summary.fullyPaid && (
                <ApplyVoucherForm orderId={order.id} vouchers={availableVouchers} />
              )}
              {isStaffLike && canModifyOrder && !summary.fullyPaid && !order.releaseException && (
                <ReleaseExceptionForm orderId={order.id} />
              )}
              {isStaffLike && canViewPayments && !summary.fullyPaid && (
                <form action={sendBalanceReminderAction.bind(null, order.id)}>
                  <Button type="submit" size="sm" variant="outline">
                    Send Balance Reminder
                  </Button>
                </form>
              )}
              {order.releaseException && (
                <p className="text-xs text-slate-500">
                  Release exception granted by {order.releaseExceptionBy}: {order.releaseExceptionReason}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {order.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payment history</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Amount</TH>
                <TH>Method</TH>
                <TH>Status</TH>
                <TH>Proof</TH>
              </TR>
            </THead>
            <TBody>
              {order.payments.map((p) => (
                <TR key={p.id}>
                  <TD>{formatDateTime(p.createdAt)}</TD>
                  <TD>{formatCurrency(p.amount.toString())}</TD>
                  <TD>{p.method.replace(/_/g, " ")}</TD>
                  <TD>
                    <StatusBadge status={p.status} />
                  </TD>
                  <TD>
                    {p.proofFilePath ? (
                      <a href={p.proofFilePath} target="_blank" className="text-sm underline text-slate-600">
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Job Orders</CardTitle>
          {isStaffLike && canModifyOrder && <AddJobOrderForm orderId={order.id} templates={templates} />}
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
              const release = releaseJobOrderAction.bind(null, jo.id);
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
                    {isStaffLike && canStartProduction && jo.status === "ON_HOLD" && (
                      <form action={start}>
                        <Button type="submit" size="sm" variant="outline">
                          Start Production
                        </Button>
                      </form>
                    )}
                    {isStaffLike && canModifyOrder && jo.status === "READY" && (
                      <form action={release}>
                        <Button type="submit" size="sm" variant="outline">
                          Release
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

      {order.fulfillments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fulfillment & Tracking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.fulfillments.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded border border-slate-100 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{f.jobOrder?.joNumber}</span>
                  <span className="text-slate-500"> — {f.method}</span>
                  {f.method === "DELIVERY" && f.trackingNumber && (
                    <span className="text-slate-500">
                      {" "}
                      · {f.courier} #{f.trackingNumber}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {f.scheduledDate && <span className="text-slate-500">{formatDate(f.scheduledDate)}</span>}
                  <StatusBadge status={f.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isStaffLike && canManageTracking && (
        <Card>
          <CardHeader>
            <CardTitle>Customer Order Tracking Link</CardTitle>
          </CardHeader>
          <CardContent>
            <TrackingLinkManager
              orderId={order.id}
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

      {canShare && (
        <Card>
          <CardHeader>
            <CardTitle>Share Document (Invoice)</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentShareManager
              docType="INVOICE"
              docId={order.id}
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

      {commsData && (
        <Card>
          <CardHeader>
            <CardTitle>Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <MessageThread
              conversationId={conversation.id}
              currentUserId={user.id}
              messages={commsData.messages}
              canSend={commsData.canSend}
              canAttach={commsData.canAttach}
              canReference={commsData.canReference}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
