import { prisma } from "@/lib/prisma";
import { publishToUser } from "@/lib/realtime";
import { sendEmailEvent } from "@/lib/email";
import { sendMessengerEvent } from "@/lib/messenger";
import { findActiveTrackingLink } from "@/lib/order-tracking";

function absoluteLink(link?: string): string {
  if (!link) return "";
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return link.startsWith("http") ? link : `${base}${link}`;
}

/** Best-effort: if this notification's internal link points at an Order that already has an active public tracking link, surface that same link in the Messenger message's "[ Track Your Order ]" line. */
async function resolveTrackingLink(link?: string): Promise<string | undefined> {
  if (!link) return undefined;
  const match = link.match(/^\/orders\/([a-zA-Z0-9_-]+)/);
  if (!match) return undefined;
  const activeLink = await findActiveTrackingLink(match[1]);
  if (!activeLink) return undefined;
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${base}/track/${activeLink.token}`;
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

  // Messenger is customer-facing regardless of whether they have a login —
  // unlike the bell/email split below, it doesn't depend on customer.userId.
  const trackingLink = await resolveTrackingLink(link);
  await sendMessengerEvent(type, customerId, { message, trackingLink });

  if (customer.userId) {
    await notifyUser(customer.userId, type, message, link);
  } else if (customer.email) {
    await sendEmailEvent(type, customer.email, { customer_name: customer.name, message, document_link: absoluteLink(link) });
  }
}
