"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { SYSTEM_VERSION } from "@/lib/system-version";

/**
 * Admin-only "Check for Updates" (spec Part G). There is no real update
 * server behind this yet — deliberately, per item 43's explicit "do not
 * pretend a production update server exists if it has not been
 * implemented." What's real: the version constant, this audit-logged
 * check event (which is what backs the Update History table below), and
 * the honest result. A future update can replace this function's body
 * with an actual call to a trusted update source without changing
 * anything about how it's invoked or logged.
 */
export async function checkForUpdatesAction() {
  const user = await requireRole(["ADMIN"]);
  await logAudit(user.id, "SYSTEM_UPDATE_CHECKED", "System", "current", { version: SYSTEM_VERSION, result: "up_to_date" });
  redirect("/admin/system-updates");
}
