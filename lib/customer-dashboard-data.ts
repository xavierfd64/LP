import { prisma } from "@/lib/prisma";
import { findCustomersWithOutstandingBalance, deriveSoaBalanceStatus, type SoaBalanceStatus } from "@/lib/soa";
import { buildJobOrderStageSteps, currentStageLabelForJobOrder } from "@/lib/order-tracking";
import { getMyConversationsAction } from "@/app/actions/messages";

/**
 * Shared query layer for the redesigned Customer Dashboard (8th update).
 * Every function is scoped to one customerId and reuses the exact same
 * helpers the rest of the app already relies on — findCustomersWithOutstandingBalance
 * / deriveSoaBalanceStatus from the SOA module (never a second balance-aging
 * calculation), buildJobOrderStageSteps from the public tracking module
 * (never a second production-progress calculation), and getMyConversationsAction
 * for unread-message counts (never a second unread-count query).
 */

export type CustomerKpis = {
  activeOrders: number;
  outstandingBalance: number;
  pendingQuotations: number;
  unreadMessages: number;
  rewardPoints: number;
};

export async function getCustomerKpis(customerId: string): Promise<CustomerKpis> {
  const [activeOrders, pendingQuotations, customer, conversations, balanceEntry] = await Promise.all([
    prisma.order.count({ where: { customerId, status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
    prisma.quotation.count({ where: { customerId, status: "SENT" } }),
    prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { rewardPointsBalance: true } }),
    getMyConversationsAction(),
    outstandingBalanceForCustomer(customerId),
  ]);

  return {
    activeOrders,
    outstandingBalance: balanceEntry?.outstandingBalance ?? 0,
    pendingQuotations,
    unreadMessages: conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    rewardPoints: customer.rewardPointsBalance,
  };
}

async function outstandingBalanceForCustomer(customerId: string) {
  const all = await findCustomersWithOutstandingBalance(new Date());
  return all.find((e) => e.customer.id === customerId) ?? null;
}

export type ActiveOrderCard = {
  id: string;
  orderNumber: string;
  productType: string | null;
  status: string;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  updatedAt: Date;
  stageSteps: { label: string; state: "done" | "current" | "upcoming" }[];
  currentStageLabel: string;
};

/** Real production-stage progress per order, reusing the exact same stage-derivation the public tracking page and Messenger Dispatch already use — not a third implementation. */
export async function getCustomerActiveOrders(customerId: string, limit = 5): Promise<ActiveOrderCard[]> {
  const orders = await prisma.order.findMany({
    where: { customerId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    include: {
      payments: { where: { status: "CONFIRMED" } },
      jobOrders: { include: { workflowTemplate: { include: { stages: true } }, stageLogs: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return orders.map((o) => {
    const paid = o.payments.reduce((s, p) => s + Number(p.amount), 0);
    const total = Number(o.totalAmount);
    const paymentStatus: ActiveOrderCard["paymentStatus"] = paid <= 0 ? "UNPAID" : paid >= total ? "PAID" : "PARTIALLY_PAID";
    const jo = o.jobOrders[0];
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      productType: jo?.productType ?? null,
      status: o.status,
      paymentStatus,
      updatedAt: o.updatedAt,
      stageSteps: jo ? buildJobOrderStageSteps(jo).map((s) => ({ label: s.label, state: s.state })) : [],
      currentStageLabel: jo ? currentStageLabelForJobOrder(jo) : "Awaiting Job Order",
    };
  });
}

export type CustomerTransactionRow = {
  type: "Quotation" | "Order" | "Invoice" | "Payment";
  reference: string;
  date: Date;
  amount: number | null;
  status: string;
  href: string;
};

/**
 * Merges this customer's own Quotation/Order/Payment rows into one
 * recent-activity feed, newest first — same merge-and-sort shape as the
 * Admin/Staff dashboard's Today's Activity, scoped to one customer and not
 * date-limited to "today" since a customer's own history is naturally
 * sparser. "Invoice" reuses the Order row (this app has no separate
 * invoice entity — an Invoice is the Order's print view), matching the
 * same architectural call already made for the Admin Quick Actions menu.
 */
export async function getCustomerRecentTransactions(customerId: string, limit = 8): Promise<CustomerTransactionRow[]> {
  const [quotations, orders, payments] = await Promise.all([
    prisma.quotation.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.order.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.payment.findMany({ where: { order: { customerId } }, include: { order: true }, orderBy: { createdAt: "desc" }, take: limit }),
  ]);

  const rows: CustomerTransactionRow[] = [
    ...quotations.map((q) => ({
      type: "Quotation" as const,
      reference: q.quoteNumber,
      date: q.createdAt,
      amount: Number(q.total),
      status: q.status,
      href: `/quotations/${q.id}`,
    })),
    ...orders.map((o) => ({
      type: "Invoice" as const,
      reference: o.orderNumber,
      date: o.createdAt,
      amount: Number(o.totalAmount),
      status: o.status,
      href: `/orders/${o.id}`,
    })),
    ...payments.map((p) => ({
      type: "Payment" as const,
      reference: p.order.orderNumber,
      date: p.createdAt,
      amount: Number(p.amount),
      status: p.status,
      href: `/orders/${p.orderId}`,
    })),
  ];

  return rows.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}

export type PaymentSummary = {
  totalOutstanding: number;
  status: SoaBalanceStatus;
  overdueAmount: number;
};

/** Thin wrapper over the same SOA aggregation the Receivables/SOA screens already use — never a second balance calculation. */
export async function getCustomerPaymentSummary(customerId: string): Promise<PaymentSummary> {
  const entry = await outstandingBalanceForCustomer(customerId);
  if (!entry) return { totalOutstanding: 0, status: "CURRENT", overdueAmount: 0 };
  return { totalOutstanding: entry.outstandingBalance, status: entry.balanceStatus, overdueAmount: entry.overdueAmount };
}

export type QuotationAwaitingAction = {
  id: string;
  quoteNumber: string;
  total: number;
  productSummary: string;
  createdAt: Date;
};

export async function getCustomerQuotationsAwaitingAction(customerId: string, limit = 5): Promise<QuotationAwaitingAction[]> {
  const quotations = await prisma.quotation.findMany({
    where: { customerId, status: "SENT" },
    include: { lineItems: { take: 1 }, inquiry: { select: { desiredProduct: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return quotations.map((q) => ({
    id: q.id,
    quoteNumber: q.quoteNumber,
    total: Number(q.total),
    productSummary: q.lineItems[0]?.description ?? q.inquiry?.desiredProduct ?? "Quotation",
    createdAt: q.createdAt,
  }));
}

export type UpcomingDeadline = {
  label: string;
  detail: string;
  date: Date;
  href: string;
  tone: "amber" | "slate";
};

/** Real payment-due and order-deadline dates only — never invented. */
export async function getCustomerUpcomingDeadlines(customerId: string, limit = 5): Promise<UpcomingDeadline[]> {
  const now = new Date();
  const orders = await prisma.order.findMany({
    where: {
      customerId,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      OR: [{ dueDate: { not: null } }],
    },
    include: { payments: { where: { status: "CONFIRMED" } } },
  });

  const deadlines: UpcomingDeadline[] = [];
  for (const o of orders) {
    if (!o.dueDate) continue;
    const paid = o.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = Number(o.totalAmount) - paid;
    if (balance > 0.01) {
      deadlines.push({
        label: "Payment Due",
        detail: o.orderNumber,
        date: o.dueDate,
        href: `/orders/${o.id}`,
        tone: o.dueDate.getTime() < now.getTime() ? "amber" : "slate",
      });
    }
  }

  return deadlines.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, limit);
}
