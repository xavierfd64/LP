"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { nextOrderNumber, nextJoNumber } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { startProduction, RuleViolation } from "@/lib/workflow";
import { notifyCustomer } from "@/lib/notifications";
import { estimateCostForLines } from "@/lib/service-cost";
import { computeTotals, type DiscountType } from "@/lib/pricing-totals";

const orderSchema = z.object({
  customerId: z.string().min(1),
  quotationId: z.string().optional(),
  // Manual (no-quotation) pricing inputs — a "NEW" order has no persisted
  // line items of its own (only an Order created FROM a Quotation does,
  // via that Quotation's lineItems), so subtotal is necessarily supplied
  // by the client here; discountType/discountValue/taxPct are then always
  // re-applied server-side via computeTotals, never trusted as a final
  // total. Ignored entirely when quotationId is set — see below, where the
  // Order's pricing is instead copied straight from the Quotation's own
  // already-computed, server-trusted breakdown.
  subtotal: z.coerce.number().nonnegative().optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  discountValue: z.coerce.number().nonnegative().optional(),
  taxPct: z.coerce.number().nonnegative().optional(),
  paymentTermType: z.enum(["STANDARD_PARTIAL", "APPROVED_TERMS"]),
  requiredPartialPct: z.coerce.number().int().min(0).max(100).default(50),
  termsApprovedBy: z.string().optional(),
  termsReason: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export async function createOrderAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("ORDER_CREATE");

  const parsed = orderSchema.safeParse({
    customerId: formData.get("customerId"),
    quotationId: formData.get("quotationId") || undefined,
    subtotal: formData.get("subtotal") || undefined,
    discountType: formData.get("discountType") || undefined,
    discountValue: formData.get("discountValue") || undefined,
    taxPct: formData.get("taxPct") || undefined,
    paymentTermType: formData.get("paymentTermType"),
    requiredPartialPct: formData.get("requiredPartialPct") || 50,
    termsApprovedBy: formData.get("termsApprovedBy") || undefined,
    termsReason: formData.get("termsReason") || undefined,
    dueDate: formData.get("dueDate") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const data = parsed.data;
  if (data.paymentTermType === "APPROVED_TERMS" && !data.termsApprovedBy) {
    return "Approved-terms orders require who authorized the exception.";
  }

  // Cost snapshot (Aug 20 4th update, Part D item 26/34) — taken once, right
  // now, from the linked Quotation's line items as they cost out at this
  // exact moment. A Service's BOM changing tomorrow must never silently
  // rewrite what this Order's production cost was at creation time, so
  // this is stored, not recomputed live on every future page view.
  let costSnapshot: { totalCost: number; fullyConfigured: boolean } | null = null;
  let sourceQuoteNumber: string | undefined;
  // Pricing breakdown (Sept 3 correction): an Order created FROM a
  // Quotation copies that Quotation's already-computed, server-trusted
  // discount/tax breakdown verbatim — never re-derived from anything the
  // client sent, and never at risk of a fixed discount silently turning
  // into "the % it happened to equal." A manually-created order (no
  // quotation) has no persisted line items of its own, so its subtotal is
  // necessarily client-supplied, but the discount/tax math on top of it is
  // always recomputed here via the same shared computeTotals() every other
  // pricing form uses — the client's own total is never trusted directly.
  let pricing: ReturnType<typeof computeTotals>;
  if (data.quotationId) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: data.quotationId },
      include: { lineItems: true },
    });
    if (quotation) {
      sourceQuoteNumber = quotation.quoteNumber;
      const estimate = await estimateCostForLines(
        quotation.lineItems.map((li) => ({ serviceId: li.serviceId, qty: li.qty, sellingAmount: Number(li.unitPrice) * li.qty }))
      );
      costSnapshot = { totalCost: estimate.totalCost, fullyConfigured: estimate.fullyConfigured };
      pricing = {
        subtotal: quotation.subtotal != null ? Number(quotation.subtotal) : quotation.lineItems.reduce((sum, li) => sum + li.qty * Number(li.unitPrice), 0),
        discountType: quotation.discountType as DiscountType,
        discountValue: Number(quotation.discountValue),
        discountAmount: Number(quotation.discountAmount),
        discountLabel: quotation.discountLabel,
        taxPct: Number(quotation.taxPct),
        taxAmount: Number(quotation.taxAmount),
        total: Number(quotation.total),
      };
    } else {
      pricing = computeTotals({ subtotal: 0, discountType: "PERCENTAGE", discountValue: 0, taxPct: 0 });
    }
  } else {
    pricing = computeTotals({
      subtotal: data.subtotal ?? 0,
      discountType: (data.discountType as DiscountType) ?? "PERCENTAGE",
      discountValue: data.discountValue ?? 0,
      taxPct: data.taxPct ?? 0,
    });
  }

  // Unified document identity (3rd Update item 5): an Order created from an
  // approved Quotation keeps that Quotation's exact date+sequence digits
  // (just ORD- in place of QUO-) rather than drawing a new number.
  const orderNumber = await nextOrderNumber(sourceQuoteNumber);

  const order = await prisma.order.create({
    data: {
      orderNumber,
      customerId: data.customerId,
      quotationId: data.quotationId,
      totalAmount: pricing.total,
      subtotal: pricing.subtotal,
      discountType: pricing.discountType,
      discountValue: pricing.discountValue,
      discountAmount: pricing.discountAmount,
      discountLabel: pricing.discountLabel,
      taxPct: pricing.taxPct,
      taxAmount: pricing.taxAmount,
      paymentTermType: data.paymentTermType,
      requiredPartialPct: data.requiredPartialPct,
      termsApprovedBy: data.paymentTermType === "APPROVED_TERMS" ? data.termsApprovedBy : undefined,
      termsReason: data.paymentTermType === "APPROVED_TERMS" ? data.termsReason : undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      notes: data.notes,
      estimatedProductionCostSnapshot: costSnapshot?.fullyConfigured ? costSnapshot.totalCost : null,
      costSnapshotFullyConfigured: costSnapshot?.fullyConfigured ?? false,
      costSnapshotTakenAt: costSnapshot ? new Date() : null,
    },
  });

  await logAudit(user.id, "ORDER_CREATED", "Order", order.id, {
    orderNumber,
    paymentTermType: data.paymentTermType,
  });
  if (data.paymentTermType === "APPROVED_TERMS") {
    await logAudit(user.id, "PAYMENT_TERMS_EXCEPTION_GRANTED", "Order", order.id, {
      termsApprovedBy: data.termsApprovedBy,
      termsReason: data.termsReason,
    });
  }

  await notifyCustomer(
    data.customerId,
    "ORDER_CREATED",
    `Your order ${orderNumber} has been created.`,
    `/orders/${order.id}`
  );

  redirect(`/orders/${order.id}?created=1`);
}

/**
 * Historical Transaction Encoding (Sept 3) — the controlled path for
 * entering an order that actually happened in the past (network/system
 * downtime, manual/offline handling) but was never entered at the time.
 * Deliberately a SEPARATE action from createOrderAction above, gated by
 * its own ORDER_BACKDATE permission, rather than a "just let staff type
 * any date into the normal form" shortcut — this is a controlled
 * mechanism for a specific real situation, not general permission to
 * backdate ordinary transactions.
 *
 * The two historicalOrderType branches are not a parallel lifecycle: a
 * PENDING_PRODUCTION order is created exactly like any other OPEN order
 * (still eligible for the normal Job Order / production workflow via the
 * existing "+ Add Job Order" action) — the only difference is `orderDate`
 * and the historical flags. An ALREADY_RELEASED order is created directly
 * as COMPLETED with no Job Order at all — since the Production
 * board/Design queue/Kanban only ever show work that has an actual
 * JobOrder row, simply never creating one is what keeps it out of
 * production; createJobOrderAction below additionally refuses to let one
 * be added to it later, as a second, backend-enforced line of defense.
 */
const historicalOrderSchema = z
  .object({
    customerId: z.string().min(1, "Please select a customer."),
    orderDate: z.string().min(1, "Actual Order Date is required."),
    historicalOrderType: z.enum(["PENDING_PRODUCTION", "ALREADY_RELEASED"]),
    releaseDate: z.string().optional(),
    subtotal: z.coerce.number().nonnegative(),
    discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
    discountValue: z.coerce.number().nonnegative().optional(),
    taxPct: z.coerce.number().nonnegative().optional(),
    paymentTermType: z.enum(["STANDARD_PARTIAL", "APPROVED_TERMS"]),
    requiredPartialPct: z.coerce.number().int().min(0).max(100).default(50),
    termsApprovedBy: z.string().optional(),
    termsReason: z.string().optional(),
    historicalNotes: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    const orderDate = new Date(data.orderDate);
    if (Number.isNaN(orderDate.getTime())) {
      ctx.addIssue({ code: "custom", path: ["orderDate"], message: "Enter a valid Actual Order Date." });
      return;
    }
    if (orderDate.getTime() > Date.now()) {
      ctx.addIssue({ code: "custom", path: ["orderDate"], message: "Actual Order Date cannot be in the future." });
    }
    if (data.historicalOrderType === "ALREADY_RELEASED") {
      if (!data.releaseDate) {
        ctx.addIssue({ code: "custom", path: ["releaseDate"], message: "Actual Release Date is required for an already-released order." });
        return;
      }
      const releaseDate = new Date(data.releaseDate);
      if (Number.isNaN(releaseDate.getTime())) {
        ctx.addIssue({ code: "custom", path: ["releaseDate"], message: "Enter a valid Actual Release Date." });
        return;
      }
      if (releaseDate.getTime() > Date.now()) {
        ctx.addIssue({ code: "custom", path: ["releaseDate"], message: "Actual Release Date cannot be in the future." });
      }
      if (releaseDate.getTime() < orderDate.getTime()) {
        ctx.addIssue({ code: "custom", path: ["releaseDate"], message: "Actual Release Date cannot be before the Actual Order Date." });
      }
    }
  });

export async function encodeHistoricalOrderAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("ORDER_BACKDATE");

  const parsed = historicalOrderSchema.safeParse({
    customerId: formData.get("customerId"),
    orderDate: formData.get("orderDate"),
    historicalOrderType: formData.get("historicalOrderType"),
    releaseDate: formData.get("releaseDate") || undefined,
    subtotal: formData.get("subtotal"),
    discountType: formData.get("discountType") || undefined,
    discountValue: formData.get("discountValue") || undefined,
    taxPct: formData.get("taxPct") || undefined,
    paymentTermType: formData.get("paymentTermType"),
    requiredPartialPct: formData.get("requiredPartialPct") || 50,
    termsApprovedBy: formData.get("termsApprovedBy") || undefined,
    termsReason: formData.get("termsReason") || undefined,
    historicalNotes: formData.get("historicalNotes") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const data = parsed.data;
  if (data.subtotal <= 0) return "Please provide at least one valid line item.";
  if (data.paymentTermType === "APPROVED_TERMS" && !data.termsApprovedBy) {
    return "Approved-terms orders require who authorized the exception.";
  }

  const orderDate = new Date(data.orderDate);
  const releaseDate = data.historicalOrderType === "ALREADY_RELEASED" ? new Date(data.releaseDate!) : null;

  const pricing = computeTotals({
    subtotal: data.subtotal,
    discountType: (data.discountType as DiscountType) ?? "PERCENTAGE",
    discountValue: data.discountValue ?? 0,
    taxPct: data.taxPct ?? 0,
  });

  // Duplicate-submission protection (Part 26) — a real risk here since this
  // feature exists specifically for situations where the connection was
  // unreliable in the first place (a slow first response followed by a
  // retried click/resubmit). Content-based, not a special marker field: if
  // this same admin already encoded an order for this exact customer,
  // business date, type, and total within the last couple of minutes,
  // treat this submission as the retry it almost certainly is and land on
  // that existing order instead of creating a second, duplicate one.
  const recentDuplicate = await prisma.order.findFirst({
    where: {
      customerId: data.customerId,
      isHistorical: true,
      historicalOrderType: data.historicalOrderType,
      orderDate,
      totalAmount: pricing.total,
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (recentDuplicate) redirect(`/orders/${recentDuplicate.id}?created=1`);

  const orderNumber = await nextOrderNumber();

  const order = await prisma.order.create({
    data: {
      orderNumber,
      customerId: data.customerId,
      totalAmount: pricing.total,
      subtotal: pricing.subtotal,
      discountType: pricing.discountType,
      discountValue: pricing.discountValue,
      discountAmount: pricing.discountAmount,
      discountLabel: pricing.discountLabel,
      taxPct: pricing.taxPct,
      taxAmount: pricing.taxAmount,
      paymentTermType: data.paymentTermType,
      requiredPartialPct: data.requiredPartialPct,
      termsApprovedBy: data.paymentTermType === "APPROVED_TERMS" ? data.termsApprovedBy : undefined,
      termsReason: data.paymentTermType === "APPROVED_TERMS" ? data.termsReason : undefined,
      // orderDate is the actual historical business date; createdAt (untouched,
      // always "now") is the real system-encoding timestamp — see the doc
      // comment on Order.orderDate.
      orderDate,
      isHistorical: true,
      historicalOrderType: data.historicalOrderType,
      historicalNotes: data.historicalNotes,
      ...(data.historicalOrderType === "ALREADY_RELEASED"
        ? { status: "COMPLETED" as const, completedAt: releaseDate }
        : { status: "OPEN" as const }),
    },
  });

  await logAudit(user.id, "ORDER_HISTORICAL_ENCODED", "Order", order.id, {
    orderNumber,
    orderDate: orderDate.toISOString(),
    historicalOrderType: data.historicalOrderType,
    releaseDate: releaseDate ? releaseDate.toISOString() : null,
    total: pricing.total,
  });

  await notifyCustomer(
    data.customerId,
    "ORDER_CREATED",
    `Your order ${orderNumber} (dated ${orderDate.toLocaleDateString()}) has been recorded.`,
    `/orders/${order.id}`
  );

  redirect(`/orders/${order.id}?created=1`);
}

const jobOrderSchema = z.object({
  orderId: z.string().min(1),
  serviceId: z.string().min(1, "Please select a service."),
  specs: z.string().optional(),
  description: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  workflowTemplateId: z.string().min(1),
  deadline: z.string().optional(),
  productionInstructions: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});

export async function createJobOrderAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("ORDER_MODIFY");

  const parsed = jobOrderSchema.safeParse({
    orderId: formData.get("orderId"),
    serviceId: formData.get("serviceId"),
    specs: formData.get("specs") || undefined,
    description: formData.get("description"),
    quantity: formData.get("quantity"),
    workflowTemplateId: formData.get("workflowTemplateId"),
    deadline: formData.get("deadline") || undefined,
    productionInstructions: formData.get("productionInstructions") || undefined,
    priority: formData.get("priority") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const data = parsed.data;

  // Aug 25 update 1 — a cancelled order must not continue through active
  // production: no new job order can be added to it.
  const parentOrder = await prisma.order.findUniqueOrThrow({ where: { id: data.orderId } });
  if (parentOrder.status === "CANCELLED") return "This order is cancelled — restore it first to add a job order.";

  // Historical Transaction Encoding (Sept 3) — Part 5's core production-
  // safety rule, enforced here, not just hidden in the UI: an order
  // encoded as "Already Released" was already completed and released
  // before it was ever entered here, and must never enter production
  // through any path, including a Job Order added after the fact.
  if (parentOrder.historicalOrderType === "ALREADY_RELEASED") {
    return "This order was encoded as already released and is not eligible for production — it cannot have a Job Order added to it.";
  }

  const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
  if (!service || !service.active) return "Please select a valid, active service.";

  let specs: Record<string, string> | undefined;
  if (data.specs) {
    try {
      specs = JSON.parse(data.specs);
    } catch {
      specs = undefined;
    }
  }

  const joNumber = await nextJoNumber(data.orderId);

  const jo = await prisma.jobOrder.create({
    data: {
      orderId: data.orderId,
      joNumber,
      productType: service.name,
      serviceId: service.id,
      specs,
      description: data.description,
      quantity: data.quantity,
      workflowTemplateId: data.workflowTemplateId,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      productionInstructions: data.productionInstructions,
      priority: data.priority ?? "MEDIUM",
      status: "ON_HOLD",
    },
  });

  const order = await prisma.order.update({ where: { id: data.orderId }, data: { status: "OPEN" } });

  await logAudit(user.id, "JOB_ORDER_CREATED", "JobOrder", jo.id, { joNumber, orderId: data.orderId });
  await notifyCustomer(order.customerId, "JOB_ORDER_CREATED", `Job order ${joNumber} has been created for your order ${order.orderNumber}.`, `/orders/${data.orderId}`);

  redirect(`/orders/${data.orderId}`);
}

export async function startProductionAction(jobOrderId: string) {
  const user = await requirePermission("PRODUCTION_UPDATE_STAGE", ["PRODUCTION"]);
  const jo = await prisma.jobOrder.findUniqueOrThrow({ where: { id: jobOrderId }, include: { order: true } });

  // Aug 25 update 1 — a cancelled order must not continue through active production.
  if (jo.order.status === "CANCELLED") {
    redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent("This order has been cancelled — restore it first to start production.")}`);
  }

  try {
    await startProduction(jobOrderId, user.id);
  } catch (e) {
    if (e instanceof RuleViolation) {
      redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }

  redirect(`/job-orders/${jo.id}`);
}

const cancelOrderSchema = z.object({
  reason: z.string().min(3, "Enter a reason for cancelling."),
});

/**
 * Order cancel (Aug 25 update 1). Business rule, chosen after inspecting
 * the Quotation → Order → Production → QC → Invoice → Payment chain: an
 * order can be cancelled as long as none of its Job Orders have reached
 * RELEASED or COMPLETED — i.e. nothing has actually been handed to the
 * customer or finished production yet. Job Orders still ON_HOLD/
 * IN_PROGRESS/QC/REWORK are left completely untouched (their stage logs,
 * QC results, and inventory consumption records are never modified or
 * deleted — full data integrity preserved); cancelling only flips the
 * Order's own status, which is what excludes it from active dashboards,
 * Upcoming Fulfillment, and the Production Kanban's live board (see the
 * order-not-cancelled filter added to those queries) — satisfying "must
 * not continue through active Production workflow" without silently
 * discarding already-completed work.
 */
export async function cancelOrderAction(orderId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("ORDER_CANCEL");
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { jobOrders: true } });

  if (order.status === "CANCELLED" || order.status === "COMPLETED") {
    return "This order can no longer be cancelled.";
  }
  const blockingJobOrder = order.jobOrders.find((jo) => jo.status === "RELEASED" || jo.status === "COMPLETED");
  if (blockingJobOrder) {
    return `This order can't be cancelled — job order ${blockingJobOrder.joNumber} has already been released/completed. Production has already been handed over.`;
  }

  const parsed = cancelOrderSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "CANCELLED",
      statusBeforeCancel: order.status,
      cancelledById: user.id,
      cancelReason: parsed.data.reason,
      cancelledAt: new Date(),
    },
  });

  await logAudit(user.id, "ORDER_CANCELLED", "Order", orderId, { previousStatus: order.status, reason: parsed.data.reason });
  await notifyCustomer(
    order.customerId,
    "ORDER_CANCELLED",
    `Order ${order.orderNumber} was cancelled: ${parsed.data.reason}`,
    `/orders/${orderId}`
  );

  redirect(`/orders/${orderId}`);
}

/** Restores a cancelled order to whatever status it was cancelled from (OPEN/IN_PRODUCTION/FULFILLING) — never a blind reset to OPEN. */
export async function restoreOrderAction(orderId: string) {
  const user = await requirePermission("ORDER_CANCEL");
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  if (order.status !== "CANCELLED") return;

  const restoredStatus = order.statusBeforeCancel ?? "OPEN";
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: restoredStatus,
      statusBeforeCancel: null,
      cancelledById: null,
      cancelReason: null,
      cancelledAt: null,
    },
  });
  await logAudit(user.id, "ORDER_RESTORED", "Order", orderId, { restoredStatus });

  redirect(`/orders/${orderId}`);
}
