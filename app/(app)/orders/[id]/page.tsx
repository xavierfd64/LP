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
import { startProductionAction, restoreOrderAction } from "@/app/actions/orders";
import { CancelOrderForm } from "./cancel-order-form";
import { releaseJobOrderAction, sendBalanceReminderAction } from "@/app/actions/payments";
import { markOrderCompletedAction } from "@/app/actions/fulfillment";
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
import { InternalCostingPanel } from "@/components/documents/internal-costing-panel";
import { estimateCostForLines, type AggregateCostEstimate } from "@/lib/service-cost";

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
      quotation: { include: { lineItems: { include: { service: true } } } },
      jobOrders: { include: { workflowTemplate: true }, orderBy: { joNumber: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
      fulfillments: { orderBy: { createdAt: "desc" }, include: { jobOrder: true } },
      cancelledBy: true,
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
  const canViewCost = isStaffLike && (isAdmin || (await can(user, "COST_VIEW")));
  const canCancel = isAdmin || (await can(user, "ORDER_CANCEL"));

  // Cost snapshot (Aug 20 4th update, Part D item 26/34) — an Order created
  // after this update stores the production cost it was quoted at, taken
  // once at creation time, and that historical figure is what's shown here
  // — never recomputed against whatever the Service's BOM looks like today
  // (spec item 27: "the old Job Order should not silently change its
  // historical quoted cost"). An Order created before this field existed
  // has no snapshot to show, so it falls back to a clearly-labeled live
  // estimate — the same behavior this page had before Part D.
  let costEstimate: AggregateCostEstimate | null = null;
  let costPanelTitle = "Order Costing";
  if (canViewCost && order.costSnapshotTakenAt) {
    const totalCost = order.estimatedProductionCostSnapshot != null ? Number(order.estimatedProductionCostSnapshot) : 0;
    const totalRevenue = Number(order.totalAmount);
    costEstimate = {
      totalCount: 1,
      configuredCount: order.costSnapshotFullyConfigured ? 1 : 0,
      unconfiguredCount: order.costSnapshotFullyConfigured ? 0 : 1,
      fullyConfigured: order.costSnapshotFullyConfigured,
      totalRevenue,
      totalCost,
      grossProfit: order.costSnapshotFullyConfigured ? totalRevenue - totalCost : null,
      margin: order.costSnapshotFullyConfigured && totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : null,
    };
    costPanelTitle = "Order Costing (as of order creation)";
  } else if (canViewCost && order.quotation) {
    // Only computable when this Order traces back to a Quotation — that's
    // the one place a per-service selling amount actually exists (spec
    // item 10: "estimated production cost", never invented from the
    // Order's own single lump-sum total).
    costEstimate = await estimateCostForLines(
      order.quotation.lineItems.map((li) => ({ serviceId: li.serviceId, qty: li.qty, sellingAmount: Number(li.unitPrice) * li.qty }))
    );
    costPanelTitle = "Order Costing (live estimate — no snapshot on file)";
  }

  const summary = await paymentSummary(order.id);
  const templates = isStaffLike
    ? await prisma.workflowTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } })
    : [];

  // "Encode once, carry forward": prefill a new Job Order from the Order's
  // Quotation so staff don't retype the Service, specs, and quantity that
  // were already captured — still fully editable/overridable in the form.
  const carryOverLineItem = order.quotation?.lineItems[0];
  const defaultJoService = carryOverLineItem?.service
    ? {
        id: carryOverLineItem.service.id,
        name: carryOverLineItem.service.name,
        category: carryOverLineItem.service.category,
        specFields: (carryOverLineItem.service.specFields as string[]) ?? [],
        workflowTemplateId: carryOverLineItem.service.workflowTemplateId,
      }
    : null;

  const activeTrackingLink =
    isStaffLike && canManageTracking ? await findActiveTrackingLink(order.id) : null;
  const activeShareLink = canShare ? await findActiveShareLink("INVOICE", order.id) : null;

  const conversation = await getOrCreateConversation(order.customerId, "ORDER", order.id);
  const commsData = !isStaffLike || canViewComms ? await getConversationMessagesAction(conversation.id) : null;

  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;
  const justCreated = sp.created === "1";

  // Transaction history — this Order's own audit trail plus its Quotation's
  // and Job Orders', merged and sorted, reusing the existing AuditLog
  // rather than a second history/timeline system. Staff-only: audit
  // entries can reference internal actors/reasons not meant for customers.
  const transactionHistory = isStaffLike
    ? await prisma.auditLog.findMany({
        where: {
          OR: [
            { entityType: "Order", entityId: order.id },
            ...(order.quotationId ? [{ entityType: "Quotation", entityId: order.quotationId }] : []),
            { entityType: "JobOrder", entityId: { in: order.jobOrders.map((jo) => jo.id) } },
            { entityType: "Payment", entityId: { in: order.payments.map((p) => p.id) } },
          ],
        },
        include: { actor: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

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
      {justCreated && isStaffLike && (
        <Alert tone="success">After creating the order, you can generate a Job Order and proceed with production.</Alert>
      )}

      {order.status === "CANCELLED" && (
        <Alert tone="error">
          Cancelled by {order.cancelledBy?.name ?? "staff"}
          {order.cancelledAt ? ` on ${formatDateTime(order.cancelledAt)}` : ""}: {order.cancelReason}
        </Alert>
      )}

      {isStaffLike && canCancel && (
        <div className="flex flex-wrap gap-2">
          {order.status !== "CANCELLED" && order.status !== "COMPLETED" && <CancelOrderForm orderId={order.id} />}
          {order.status === "CANCELLED" && (
            <form action={restoreOrderAction.bind(null, order.id)}>
              <Button type="submit" variant="outline" size="sm">
                Restore Order
              </Button>
            </form>
          )}
          {/* 3rd Update item 4: manual escape hatch for an order that finished
              production and release but never went through (or finished) the
              formal Fulfillment sub-flow — without this it stays stuck at
              OPEN/FULFILLING forever even though it's genuinely done. Only
              offered once every job order has at least been released, so it
              can't be used to skip production/QC. */}
          {canModifyOrder &&
            order.status !== "CANCELLED" &&
            order.status !== "COMPLETED" &&
            order.jobOrders.length > 0 &&
            order.jobOrders.every((jo) => jo.status === "RELEASED" || jo.status === "COMPLETED") && (
              <form action={markOrderCompletedAction.bind(null, order.id)}>
                <Button type="submit" size="sm">
                  Mark Order as Completed
                </Button>
              </form>
            )}
        </div>
      )}

      {order.quotation && (
        <Card>
          <CardHeader>
            <CardTitle>Quotation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <Link href={`/quotations/${order.quotation.id}`} className="font-medium text-slate-900 underline">
                {order.quotation.quoteNumber}
              </Link>
              <span className="ml-2 text-slate-400">Order No.: {order.orderNumber}</span>
            </div>
            <StatusBadge status={order.quotation.status} />
          </CardContent>
        </Card>
      )}

      {costEstimate && <InternalCostingPanel estimate={costEstimate} title={costPanelTitle} />}

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
            {isStaffLike && canRecordPayment && !summary.fullyPaid && order.status !== "CANCELLED" && (
              <RecordPaymentDialog
                orderId={order.id}
                orderNumber={order.orderNumber}
                customerName={order.customer.name}
                balanceDue={summary.total - summary.confirmed}
              />
            )}
            <div className="pt-2 flex flex-col gap-2 items-start">
              {!isStaffLike && !summary.fullyPaid && order.status !== "CANCELLED" && <PaymentProofForm orderId={order.id} />}
              {!isStaffLike && !summary.fullyPaid && order.status !== "CANCELLED" && (
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
          {isStaffLike && canModifyOrder && order.status !== "CANCELLED" && (
            <AddJobOrderForm
              orderId={order.id}
              templates={templates}
              defaultService={defaultJoService}
              defaultQuantity={carryOverLineItem?.qty}
              defaultDescription={carryOverLineItem?.description}
              defaultSpecs={(carryOverLineItem?.specs as Record<string, string> | null) ?? null}
            />
          )}
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
                    {isStaffLike && canStartProduction && jo.status === "ON_HOLD" && order.status !== "CANCELLED" && (
                      <form action={start}>
                        <Button type="submit" size="sm" variant="outline">
                          Start Production
                        </Button>
                      </form>
                    )}
                    {isStaffLike && canModifyOrder && jo.status === "READY" && order.status !== "CANCELLED" && (
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

      {isStaffLike && transactionHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {transactionHistory.map((entry) => (
                <li key={entry.id} className="flex gap-3 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                  <div>
                    <p className="font-medium text-slate-900">{entry.action.replace(/_/g, " ")}</p>
                    {/* suppressHydrationWarning: formatDateTime is timezone-dependent
                        (server process TZ vs. the browser's own, independent TZ) — the
                        same known, previously-fixed divergence as Update 5's date
                        renderings; the displayed value is correct either way. */}
                    <p className="text-xs text-slate-400" suppressHydrationWarning>
                      {formatDateTime(entry.createdAt)}
                      {entry.actor ? ` · ${entry.actor.name}` : entry.changes ? " · System" : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
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
