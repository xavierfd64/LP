import { prisma } from "@/lib/prisma";
import { publishToUser } from "@/lib/realtime";
import { sendEmailEvent } from "@/lib/email";

function absoluteLink(link?: string): string {
  if (!link) return "";
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return link.startsWith("http") ? link : `${base}${link}`;
}

/**
 * Centralized notification funnel (spec: "Business Event -> Notification
 * Service -> checks Email Master Switch / Individual Event Setting /
 * Customer Email / Template -> Email Queue -> Configured Email Provider").
 * Every existing call site across app/actions/** that already produces a
 * bell notification becomes email-capable through this one change — no
 * module implements its own email logic. sendEmailEvent no-ops safely
 * (wrong/missing type, master switch off, event disabled, no address) so
 * this never risks the underlying transaction.
 */
export async function notifyUser(userId: string, type: string, message: string, link?: string) {
  const notification = await prisma.notification.create({ data: { userId, type, message, link } });
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

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (user) {
    await sendEmailEvent(type, user.email, { customer_name: user.name, message, document_link: absoluteLink(link) });
  }
}

/** Notifies every STAFF and ADMIN account (ops-facing events). */
export async function notifyStaff(type: string, message: string, link?: string) {
  const users = await prisma.user.findMany({ where: { role: { in: ["STAFF", "ADMIN"] } }, select: { id: true } });
  await Promise.all(users.map((u) => notifyUser(u.id, type, message, link)));
}

/**
 * Notifies a specific customer. If they have a login account, this goes
 * through notifyUser as before (bell + email via the linked User's
 * email). A walk-in Customer Record with no login can't receive an
 * in-app bell notification (there's no User to attach it to), but can
 * still receive email directly via Customer.email — login-free customers
 * must still be reachable for things like a Statement of Account.
 */
export async function notifyCustomer(customerId: string, type: string, message: string, link?: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { userId: true, email: true, name: true },
  });
  if (!customer) return;
  if (customer.userId) {
    await notifyUser(customer.userId, type, message, link);
  } else if (customer.email) {
    await sendEmailEvent(type, customer.email, { customer_name: customer.name, message, document_link: absoluteLink(link) });
  }
}
