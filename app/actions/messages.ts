"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";
import { getOrCreateConversation, markConversationRead, conversationReferenceLabel } from "@/lib/conversations";
import { publishToUsers } from "@/lib/realtime";

const messageSchema = z.object({
  body: z.string().min(1, "Message can't be empty."),
});

export async function startGeneralConversationAction() {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");
  const customer = await getCurrentCustomer(user.id);
  const conversation = await getOrCreateConversation(customer.id, "GENERAL");
  redirect(`/messages/${conversation.id}`);
}

/** Data-returning variant of startGeneralConversationAction for the floating widget, which stays on the current page instead of navigating to /messages/[id]. */
export async function openOrCreateGeneralConversationAction() {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");
  const customer = await getCurrentCustomer(user.id);
  const conversation = await getOrCreateConversation(customer.id, "GENERAL");
  return { id: conversation.id };
}

/**
 * Conversation previews for the floating widget — same underlying data/
 * access rules as the /messages inbox list. Customers see their own
 * conversations; STAFF (gated by COMMUNICATION_VIEW) and ADMIN see every
 * customer conversation, each carrying the customer name and a transaction
 * reference label so Staff/Admin get context without leaving the widget.
 */
export async function getMyConversationsAction() {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (isStaffLike) {
    if (!(await can(user, "COMMUNICATION_VIEW"))) throw new Error("Not allowed.");
  } else if (user.role !== "CUSTOMER") {
    throw new Error("Not allowed.");
  }

  const where = isStaffLike ? {} : { customerId: (await getCurrentCustomer(user.id)).id };

  const conversations = await prisma.conversation.findMany({
    where,
    include: {
      customer: true,
      inquiry: { select: { desiredProduct: true } },
      quotation: { select: { quoteNumber: true } },
      order: { select: { orderNumber: true } },
      jobOrder: { select: { joNumber: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: true } },
      reads: { where: { userId: user.id } },
    },
    orderBy: { createdAt: "desc" },
  });

  const withMeta = await Promise.all(
    conversations.map(async (c) => {
      const lastMessage = c.messages[0];
      const lastReadAt = c.reads[0]?.lastReadAt ?? new Date(0);
      const unreadCount = await prisma.message.count({
        where: { conversationId: c.id, senderId: { not: user.id }, createdAt: { gt: lastReadAt } },
      });
      return {
        id: c.id,
        subjectType: c.subjectType,
        referenceLabel: conversationReferenceLabel(c),
        customerName: isStaffLike ? c.customer.name : undefined,
        lastMessage: lastMessage
          ? { body: lastMessage.body, senderName: lastMessage.sender.name, createdAt: lastMessage.createdAt.toISOString() }
          : null,
        unreadCount,
        updatedAt: (lastMessage?.createdAt ?? c.createdAt).toISOString(),
      };
    })
  );

  withMeta.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return withMeta;
}

/** Messages for one conversation, marking it read — for the floating widget's thread view. Also reports whether the viewer may send (COMMUNICATION_SEND for Staff), so the widget can show a view-only state without a second round trip. */
export async function getConversationMessagesAction(conversationId: string) {
  const user = await requireUser();
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });

  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  let canSend: boolean;
  if (isStaffLike) {
    if (!(await can(user, "COMMUNICATION_VIEW"))) throw new Error("Not allowed.");
    canSend = await can(user, "COMMUNICATION_SEND");
  } else if (user.role === "CUSTOMER") {
    const customer = await getCurrentCustomer(user.id);
    if (conversation.customerId !== customer.id) throw new Error("Not allowed.");
    canSend = true;
  } else {
    throw new Error("Not allowed.");
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    include: { sender: true },
  });
  await markConversationRead(conversationId, user.id);

  return {
    canSend,
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      senderId: m.senderId,
      sender: { name: m.sender.name, role: m.sender.role },
    })),
  };
}

/** Marks a conversation read without fetching messages — used when the widget's already-open thread receives a live message. */
export async function markConversationReadAction(conversationId: string) {
  const user = await requireUser();
  if (user.role === "STAFF" && !(await can(user, "COMMUNICATION_VIEW"))) throw new Error("Not allowed.");
  await markConversationRead(conversationId, user.id);
}

export async function sendMessageAction(conversationId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });

  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (isStaffLike) {
    if (!(await can(user, "COMMUNICATION_SEND"))) throw new Error("Not allowed.");
  } else {
    if (user.role !== "CUSTOMER") throw new Error("Not allowed.");
    const customer = await getCurrentCustomer(user.id);
    if (conversation.customerId !== customer.id) throw new Error("Not allowed.");
  }

  const parsed = messageSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const message = await prisma.message.create({
    data: { conversationId, senderId: user.id, body: parsed.data.body },
    include: { sender: true },
  });
  await markConversationRead(conversationId, user.id);

  const preview = parsed.data.body.length > 80 ? `${parsed.data.body.slice(0, 80)}...` : parsed.data.body;
  const link = `/messages/${conversationId}`;

  // Recipients for the live "message" push: the sender's own userId too
  // (so their other open tabs update via the same SSE channel instead of
  // relying on local optimistic state), plus whoever notifyCustomer/
  // notifyStaff below would notify.
  const recipientUserIds = new Set<string>([user.id]);
  if (isStaffLike) {
    await notifyCustomer(conversation.customerId, "NEW_MESSAGE", `New message: "${preview}"`, link);
    const customer = await prisma.customer.findUnique({ where: { id: conversation.customerId }, select: { userId: true } });
    if (customer?.userId) recipientUserIds.add(customer.userId);
  } else {
    await notifyStaff("NEW_MESSAGE", `New message from customer: "${preview}"`, link);
    const staffUsers = await prisma.user.findMany({ where: { role: { in: ["STAFF", "ADMIN"] } }, select: { id: true } });
    for (const u of staffUsers) recipientUserIds.add(u.id);
  }

  publishToUsers(Array.from(recipientUserIds), {
    type: "message",
    conversationId,
    message: {
      id: message.id,
      body: message.body,
      senderId: message.senderId,
      senderName: message.sender.name,
      senderRole: message.sender.role,
      createdAt: message.createdAt.toISOString(),
    },
  });
}
