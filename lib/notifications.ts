import { prisma } from "@/lib/prisma";
import { publishToUser } from "@/lib/realtime";

// STUB: real SMS/email push would go here (e.g. via Twilio / SendGrid) in
// addition to the in-app Notification row. For the prototype we just log.
function logStub(to: string, message: string) {
  console.log(`[STUB NOTIFY] to ${to}: ${message}`);
}

export async function notifyUser(userId: string, type: string, message: string, link?: string) {
  const notification = await prisma.notification.create({ data: { userId, type, message, link } });
  logStub(userId, message);
  publishToUser(userId, {
    type: "notification",
    notification: {
      id: notification.id,
      type: notification.type,
      message: notification.message,
      link: notification.link,
      read: notification.read,
      createdAt: notification.createdAt.toISOString(),
    },
  });
}

/** Notifies every STAFF and ADMIN account (ops-facing events). */
export async function notifyStaff(type: string, message: string, link?: string) {
  const users = await prisma.user.findMany({ where: { role: { in: ["STAFF", "ADMIN"] } }, select: { id: true } });
  await Promise.all(users.map((u) => notifyUser(u.id, type, message, link)));
}

/** Notifies a specific customer's linked User account, if any (walk-in customers with no login are skipped). */
export async function notifyCustomer(customerId: string, type: string, message: string, link?: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { userId: true } });
  if (customer?.userId) await notifyUser(customer.userId, type, message, link);
}
