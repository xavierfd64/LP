"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";
import { getOrCreateConversation, markConversationRead } from "@/lib/conversations";
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
