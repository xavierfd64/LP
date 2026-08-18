"use server";

import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getFinancialOverview, getReceivableDetails, type FinancialPeriod } from "@/lib/dashboard-data";

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
