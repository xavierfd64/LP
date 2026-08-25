"use server";

import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { getFinancialOverview, getReceivableDetails, type FinancialPeriod } from "@/lib/dashboard-data";
import { computeStatementOfAccount, deriveSoaBalanceStatus } from "@/lib/soa";

/** Backs the Financial Overview card's period selector (spec item 14) — Admin/Staff only, same data every other financial view in the app already draws from. */
export async function getFinancialOverviewAction(period: FinancialPeriod) {
  await requireRole(["ADMIN", "STAFF"]);
  return getFinancialOverview(period);
}

/** Backs the Receivable Details modal (9th update) — same PAYMENT_VIEW gate as the Receivables card itself, so the action can't be called directly by a Staff account the dashboard wouldn't show the card to. */
export async function getReceivableDetailsAction(customerId: string) {
  const user = await requireRole(["ADMIN", "STAFF"]);
  if (user.role === "STAFF" && !(await can(user, "PAYMENT_VIEW"))) throw new Error("Not allowed.");
  return getReceivableDetails(customerId);
}

/**
 * Backs the Receivables card's SOA dialogue box (Aug 25 update 1) — same
 * data /soa/customer/[customerId] itself reads, just fetched client-side
 * for a modal instead of server-rendered on a dedicated page (that page
 * stays reachable directly too, e.g. from "View all"). Same SOA_VIEW gate.
 */
export async function getSoaModalDataAction(customerId: string) {
  const user = await requireRole(["ADMIN", "STAFF"]);
  if (user.role === "STAFF" && !(await can(user, "SOA_VIEW"))) throw new Error("Not allowed.");
  const canGenerate = user.role === "ADMIN" || (await can(user, "SOA_GENERATE"));

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("Customer not found.");

  const [statements, openOrders, schedule] = await Promise.all([
    prisma.statementOfAccount.findMany({ where: { customerId }, orderBy: { generatedAt: "desc" }, take: 20 }),
    prisma.order.findMany({ where: { customerId, status: { not: "CANCELLED" } }, select: { dueDate: true } }),
    prisma.statementSchedule.findFirst({ where: { customerId } }),
  ]);

  const snapshot = await computeStatementOfAccount(customerId, new Date(0), new Date());
  const balanceStatus = deriveSoaBalanceStatus(openOrders);

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      displayId: customer.displayId,
      companyName: customer.companyName,
      address: customer.address,
      email: customer.email,
      contactNumber: customer.contactNumber,
      facebookUrl: customer.facebookUrl,
    },
    canGenerate,
    outstandingBalance: Math.max(snapshot.outstandingBalance, 0),
    balanceStatus,
    statements: statements.map((s) => ({
      id: s.id,
      statementNumber: s.statementNumber,
      periodStart: s.periodStart.toISOString(),
      periodEnd: s.periodEnd.toISOString(),
      generatedAt: s.generatedAt.toISOString(),
      outstandingBalance: s.outstandingBalance.toString(),
    })),
    schedule: schedule
      ? {
          id: schedule.id,
          dayOfMonth: schedule.dayOfMonth,
          onlyIfOutstanding: schedule.onlyIfOutstanding,
          enabled: schedule.enabled,
          lastRunAt: schedule.lastRunAt ? schedule.lastRunAt.toISOString() : null,
        }
      : null,
  };
}
