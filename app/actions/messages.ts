"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";

const messageSchema = z.object({
  body: z.string().min(1, "Message can't be empty."),
});

export async function sendMessageAction(orderId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) {
    if (user.role !== "CUSTOMER") throw new Error("Not allowed.");
    const customer = await getCurrentCustomer(user.id);
    if (order.customerId !== customer.id) throw new Error("Not allowed.");
  }

  const parsed = messageSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  await prisma.message.create({
    data: { orderId, senderId: user.id, body: parsed.data.body },
  });

  const preview = parsed.data.body.length > 80 ? `${parsed.data.body.slice(0, 80)}...` : parsed.data.body;
  if (isStaffLike) {
    await notifyCustomer(order.customerId, "NEW_MESSAGE", `New message on order ${order.orderNumber}: "${preview}"`, `/orders/${orderId}`);
  } else {
    await notifyStaff("NEW_MESSAGE", `New message from customer on order ${order.orderNumber}: "${preview}"`, `/orders/${orderId}`);
  }

  redirect(`/orders/${orderId}`);
}
