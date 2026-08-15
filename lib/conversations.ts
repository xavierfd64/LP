import { prisma } from "@/lib/prisma";

export type ConversationSubjectType = "INQUIRY" | "QUOTATION" | "ORDER" | "JOB_ORDER" | "GENERAL";

/** Finds the existing conversation for this (customer, subject) pair, or creates one. Idempotent. */
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

  const existing = await prisma.conversation.findFirst({ where });
  if (existing) return existing;

  return prisma.conversation.create({ data: where });
}

/** Marks a conversation as read up to now for the given user. */
export async function markConversationRead(conversationId: string, userId: string) {
  await prisma.conversationRead.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    update: { lastReadAt: new Date() },
    create: { conversationId, userId },
  });
}

export function conversationSubjectLabel(c: { subjectType: string }) {
  switch (c.subjectType) {
    case "INQUIRY":
      return "Inquiry";
    case "QUOTATION":
      return "Quotation";
    case "ORDER":
      return "Order";
    case "JOB_ORDER":
      return "Job Order";
    default:
      return "General Support";
  }
}

/** Where the source record for a conversation's subject lives, if any. */
export function conversationSourceLink(c: {
  subjectType: string;
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
