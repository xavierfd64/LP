import { prisma } from "@/lib/prisma";

export type ConversationSubjectType = "INQUIRY" | "QUOTATION" | "ORDER" | "JOB_ORDER" | "GENERAL";

/** Finds the existing per-subject conversation for this (customer, subject) pair, or creates one. Idempotent. Used by the Order detail page's embedded thread — legacy per-transaction conversations, not the central Chatbox. */
export async function getOrCreateConversation(
  customerId: string,
  subjectType: ConversationSubjectType,
  subjectId?: string
) {
  const where = {
    customerId,
    subjectType,
    inquiryId: subjectType === "INQUIRY" ? subjectId : null,
    quotationId: subjectType === "QUOTATION" ? subjectId : null,
    orderId: subjectType === "ORDER" ? subjectId : null,
    jobOrderId: subjectType === "JOB_ORDER" ? subjectId : null,
  };

  const existing = await prisma.conversation.findFirst({ where: { ...where, type: "CUSTOMER" } });
  if (existing) return existing;

  return prisma.conversation.create({ data: { ...where, type: "CUSTOMER" } });
}

/** The customer's single ongoing "central Chatbox" conversation — where Inquiry/Quotation/Job Order references get attached inline (see MessageRefType) instead of spawning a separate conversation per transaction. Idempotent. */
export async function getOrCreateGeneralConversation(customerId: string) {
  return getOrCreateConversation(customerId, "GENERAL");
}

/** Marks a conversation as read up to now for the given user. */
export async function markConversationRead(conversationId: string, userId: string) {
  await prisma.conversationRead.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    update: { lastReadAt: new Date() },
    create: { conversationId, userId },
  });
}

/** Human-readable "what this conversation is about" label, including the actual reference number where available (e.g. "Quotation #QT-2026-0001") so Staff/Admin don't have to go find the record to know the context. Only meaningful for type=CUSTOMER/CUSTOMER_GROUP rows, which always carry a subjectType; PRIVATE/GROUP rows have none. */
export function conversationReferenceLabel(c: {
  subjectType: string | null;
  inquiry?: { desiredProduct: string } | null;
  quotation?: { quoteNumber: string } | null;
  order?: { orderNumber: string } | null;
  jobOrder?: { joNumber: string } | null;
}) {
  switch (c.subjectType) {
    case "INQUIRY":
      return c.inquiry ? `Inquiry: ${c.inquiry.desiredProduct}` : "Inquiry";
    case "QUOTATION":
      return c.quotation ? `Quotation #${c.quotation.quoteNumber}` : "Quotation";
    case "ORDER":
      return c.order ? `Order #${c.order.orderNumber}` : "Order";
    case "JOB_ORDER":
      return c.jobOrder ? `Job Order #${c.jobOrder.joNumber}` : "Job Order";
    default:
      return "General Support";
  }
}

/** Where the source record for a conversation's subject lives, if any. */
export function conversationSourceLink(c: {
  subjectType: string | null;
  inquiryId: string | null;
  quotationId: string | null;
  orderId: string | null;
  jobOrderId: string | null;
}) {
  switch (c.subjectType) {
    case "INQUIRY":
      return c.inquiryId ? `/inquiries/${c.inquiryId}` : null;
    case "QUOTATION":
      return c.quotationId ? `/quotations/${c.quotationId}` : null;
    case "ORDER":
      return c.orderId ? `/orders/${c.orderId}` : null;
    case "JOB_ORDER":
      return c.jobOrderId ? `/job-orders/${c.jobOrderId}` : null;
    default:
      return null;
  }
}

/** Where a per-message transaction reference (MessageRefType) points to. */
export function messageRefLink(m: {
  refType: string | null;
  refInquiryId: string | null;
  refQuotationId: string | null;
  refJobOrderId: string | null;
}) {
  switch (m.refType) {
    case "INQUIRY":
      return m.refInquiryId ? `/inquiries/${m.refInquiryId}` : null;
    case "QUOTATION":
      return m.refQuotationId ? `/quotations/${m.refQuotationId}` : null;
    case "JOB_ORDER":
      return m.refJobOrderId ? `/job-orders/${m.refJobOrderId}` : null;
    default:
      return null;
  }
}
