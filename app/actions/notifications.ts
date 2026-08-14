"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function markNotificationReadAction(notificationId: string) {
  const user = await requireUser();
  const notification = await prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
  if (notification.userId !== user.id) throw new Error("Not allowed.");

  await prisma.notification.update({ where: { id: notificationId }, data: { read: true } });
  revalidatePath("/", "layout");
}

/** Marks a notification read and navigates to its link (used when a user clicks a notification row). */
export async function openNotificationAction(notificationId: string) {
  const user = await requireUser();
  const notification = await prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
  if (notification.userId !== user.id) throw new Error("Not allowed.");

  await prisma.notification.update({ where: { id: notificationId }, data: { read: true } });
  redirect(notification.link ?? "/dashboard");
}

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
  revalidatePath("/", "layout");
}
