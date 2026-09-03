import { prisma } from "@/lib/prisma";
import { nextOrderNumber } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";
import { paymentSummary } from "@/lib/workflow";
import { publishProductionUpdate } from "@/lib/production-realtime";

/**
 * The Master Transaction / Order reference the spec asks for is not a new
 * entity — `Order` already carries an `ORD-YYYY-MMDD-NNNN` number (the same
 * transaction identity as its source Quotation, see lib/numbering.ts) and
 * already links Quotation -> JobOrder[] -> Payment[] -> Fulfillment[]. This module
 * only adds the *automatic* creation of that Order (and its first Job
 * Order) on quotation approval, replacing what used to be two separate
 * manual clicks ("Create Order", then "+ Add Job Order") with zero
 * re-encoding — it does not introduce a second transaction model.
 */

/**
 * Idempotently creates the Order for a just-approved Quotation, reusing
 * exactly the same fields the manual "Create Order" form has always used.
 * Payment terms are derived from the existing Customer.isQualifiedForTerms
 * flag rather than a new rule — the same "approved-terms exception" the
 * manual form already supports, just applied automatically instead of
 * requiring a Staff member to notice and select it.
 *
 * Safe to call more than once for the same quotation (repeated clicks,
 * retries): if an Order already exists for this quotationId, it's reused
 * as-is rather than creating a duplicate.
 */
export async function convertApprovedQuotationToOrder(
  quotationId: string,
  actorId: string | null
): Promise<{ orderId: string }> {
  const existing = await prisma.order.findFirst({ where: { quotationId } });
  if (existing) return { orderId: existing.id };

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { customer: true },
  });

  const isQualifiedForTerms = quotation.customer.isQualifiedForTerms;
  // Unified document identity (3rd Update item 5) — same date+sequence digits as the Quotation, ORD- in place of QUO-.
  const orderNumber = await nextOrderNumber(quotation.quoteNumber);

  const order = await prisma.order.create({
    data: {
      orderNumber,
      customerId: quotation.customerId,
      quotationId: quotation.id,
      totalAmount: quotation.total,
      // Pricing breakdown copied verbatim from the Quotation (Sept 3
      // correction) — same fields the manual "Create Order from Quotation"
      // path copies in app/actions/orders.ts, kept in sync here so an
      // auto-created Order (the normal path — see this module's own
      // comment above) never loses its discount type/value or tax rate.
      subtotal: quotation.subtotal,
      discountType: quotation.discountType,
      discountValue: quotation.discountValue,
      discountAmount: quotation.discountAmount,
      discountLabel: quotation.discountLabel,
      taxPct: quotation.taxPct,
      taxAmount: quotation.taxAmount,
      paymentTermType: isQualifiedForTerms ? "APPROVED_TERMS" : "STANDARD_PARTIAL",
      requiredPartialPct: 50,
      termsApprovedBy: isQualifiedForTerms
        ? "Automatically applied — customer qualifies for approved payment terms"
        : undefined,
      termsReason: isQualifiedForTerms
        ? "Customer Record is flagged as qualified for approved payment terms (government/corporate/credit account)."
        : undefined,
    },
  });

  await logAudit(actorId, "ORDER_CREATED", "Order", order.id, {
    orderNumber,
    quoteNumber: quotation.quoteNumber,
    auto: true,
    paymentTermType: order.paymentTermType,
  });
  await notifyCustomer(
    quotation.customerId,
    "ORDER_CREATED",
    `Your order ${orderNumber} has been created from quotation ${quotation.quoteNumber}.`,
    `/orders/${order.id}`
  );

  return { orderId: order.id };
}

export type AutoJoResult =
  | { created: true; jobOrderId: string; joNumber: string }
  | { created: false; reason: "ALREADY_EXISTS" | "NO_LINE_ITEM" | "NO_PRODUCTION_FLOW" };

/**
 * Idempotently auto-creates the primary Job Order for an Order, carrying
 * forward its Quotation's first line item (service/specs/quantity/
 * description) with zero re-encoding. Safe against concurrent callers for
 * the same order — a row lock on the Order serializes any overlapping
 * attempts (repeated approval clicks, a payment-confirm retry racing a
 * page refresh, etc.), and an already-existing Job Order short-circuits
 * before anything is written.
 *
 * Only ever creates the *first* Job Order for an order automatically — a
 * quotation needing more than one Job Order (multiple distinct production
 * jobs under one order) still uses the existing manual "+ Add Job Order"
 * action for the additional ones, unchanged.
 */
export async function autoCreateJobOrderForOrder(orderId: string, trigger: string, actorId: string | null): Promise<AutoJoResult> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;

    const existingJo = await tx.jobOrder.findFirst({ where: { orderId } });
    if (existingJo) return { created: false as const, reason: "ALREADY_EXISTS" as const };

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        quotation: { include: { lineItems: { include: { service: true } } } },
      },
    });

    const line = order.quotation?.lineItems[0];
    if (!line) return { created: false as const, reason: "NO_LINE_ITEM" as const };
    if (!line.serviceId || !line.service?.workflowTemplateId) {
      return { created: false as const, reason: "NO_PRODUCTION_FLOW" as const };
    }

    // Retains the parent Order's transaction identity rather than a
    // separate JO-001-style sequence (3rd Update item 6) — see
    // lib/numbering.ts's nextJoNumber, whose exact same logic this inlines
    // since it must run inside this transaction's row lock.
    const count = await tx.jobOrder.count({ where: { orderId } });
    const joNumber = count === 0 ? order.orderNumber : `${order.orderNumber}-${count + 1}`;

    const jo = await tx.jobOrder.create({
      data: {
        orderId,
        joNumber,
        productType: line.productType,
        serviceId: line.serviceId,
        specs: line.specs ?? undefined,
        description: line.description,
        quantity: line.qty,
        workflowTemplateId: line.service.workflowTemplateId,
        status: "ON_HOLD",
      },
    });
    await tx.order.update({ where: { id: orderId }, data: { status: "OPEN" } });

    return {
      created: true as const,
      jobOrderId: jo.id,
      joNumber: jo.joNumber,
      customerId: order.customerId,
      quoteNumber: order.quotation?.quoteNumber ?? null,
    };
  });

  if (result.created) {
    await logAudit(actorId, "JOB_ORDER_AUTO_CREATED", "JobOrder", result.jobOrderId, {
      orderId,
      joNumber: result.joNumber,
      quoteNumber: result.quoteNumber,
      trigger,
    });
    await notifyStaff(
      "JOB_ORDER_CREATED",
      `Job order ${result.joNumber} was automatically created${result.quoteNumber ? ` from quotation ${result.quoteNumber}` : ""} (${trigger}).`,
      `/orders/${orderId}`
    );
    await notifyCustomer(
      result.customerId,
      "JOB_ORDER_CREATED",
      `Your order has been approved and is now being processed. Job order ${result.joNumber} has been created.`,
      `/orders/${orderId}`
    );
    await publishProductionUpdate();
    return { created: true, jobOrderId: result.jobOrderId, joNumber: result.joNumber };
  }
  return { created: false, reason: result.reason };
}

/**
 * The single entry point every quotation-approval path calls (customer
 * approve, staff force-approve): creates the Order, then immediately
 * auto-creates the Job Order if the existing payment rules (reused, not
 * duplicated, via lib/workflow.ts's paymentSummary) say none is required
 * yet — a qualified-for-terms customer, or a quotation with a zero total.
 * Otherwise the Order sits with no Job Order until a payment satisfies
 * paymentSummary's partialMet, at which point the payment-confirming
 * actions (recordPaymentAction/confirmPaymentAction/applyVoucherAction)
 * call autoCreateJobOrderForOrder themselves.
 */
export async function convertApprovedQuotation(quotationId: string, actorId: string | null): Promise<void> {
  const { orderId } = await convertApprovedQuotationToOrder(quotationId, actorId);
  const summary = await paymentSummary(orderId);
  if (summary.hasApprovedTerms || summary.partialMet) {
    const trigger = summary.hasApprovedTerms ? "Quotation Approved + Approved Payment Terms" : "Quotation Approved + No Payment Required";
    await autoCreateJobOrderForOrder(orderId, trigger, actorId);
  }
}
