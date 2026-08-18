"use server";

import { requireRole } from "@/lib/session";
import { getFinancialOverview, type FinancialPeriod } from "@/lib/dashboard-data";

/** Backs the Financial Overview card's period selector (spec item 14) — Admin/Staff only, same data every other financial view in the app already draws from. */
export async function getFinancialOverviewAction(period: FinancialPeriod) {
  await requireRole(["ADMIN", "STAFF"]);
  return getFinancialOverview(period);
}
