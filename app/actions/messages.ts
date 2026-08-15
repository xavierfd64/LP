"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";
import { getOrCreateConversation, markConversationRead } from "@/lib/conversations";

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

  await prisma.message.create({
    data: { conversationId, senderId: user.id, body: parsed.data.body },
  });
  await markConversationRead(conversationId, user.id);

  const preview = parsed.data.body.length > 80 ? `${parsed.data.body.slice(0, 80)}...` : parsed.data.body;
  const link = `/messages/${conversationId}`;
  if (isStaffLike) {
    await notifyCustomer(conversation.customerId, "NEW_MESSAGE", `New message: "${preview}"`, link);
  } else {
    await notifyStaff("NEW_MESSAGE", `New message from customer: "${preview}"`, link);
  }

  redirect(link);
}
