import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSecurityHistory } from "@/lib/security-history";
import { SecurityHistoryTable } from "@/components/auth/security-history-table";
import { ResetPasswordModal } from "../../reset-password-modal";

const ROLE_TONE: Record<string, "purple" | "blue" | "green" | "slate"> = {
  ADMIN: "purple",
  STAFF: "blue",
  PRODUCTION: "green",
  CUSTOMER: "slate",
};

/**
 * Admin/authorized-staff view of one account's login/security history
 * (Sept 8 — User Profile/Progressive Lockout/Security History
 * improvement) — the "View Security History" destination linked from the
 * SECURITY ALERT notification fired on a 24-hour block
 * (lib/auth.ts authorize()), and reachable from a "History" action on
 * /admin/users. Gated the same way that list page already is (USER_VIEW
 * or Admin) rather than a new permission.
 */
export default async function UserSecurityHistoryPage({
  params,
  searchParams,
}: PageProps<"/admin/users/[userId]/security-history">) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const isStaffLike = isAdmin || user.role === "STAFF";
  if (!isStaffLike) redirect("/dashboard");
  const canView = isAdmin || (await can(user, "USER_VIEW"));
  if (!canView) redirect("/dashboard");
  const canResetPassword = isAdmin || (await can(user, "USER_RESET_PASSWORD"));

  const { userId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) notFound();

  const canResetThis = canResetPassword && (target.role !== "ADMIN" || isAdmin);
  const history = await getSecurityHistory(userId, { page, pageSize: 20 });

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/admin/users" className="text-sm text-slate-500 underline">
          ← Users
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{target.name}</h1>
            <Badge tone={ROLE_TONE[target.role] ?? "slate"}>{target.role}</Badge>
            <Badge tone={target.active ? "green" : "red"}>{target.active ? "Active" : "Deactivated"}</Badge>
            {target.lockoutStage > 0 && target.lockedUntil && target.lockedUntil > new Date() && (
              <Badge tone="red">{target.lockoutStage >= 4 ? "Blocked 24h" : "Locked"}</Badge>
            )}
          </div>
          {canResetThis && <ResetPasswordModal userId={target.id} name={target.name} email={target.email} />}
        </div>
        <p className="text-sm text-slate-500">{target.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Login &amp; Security History</CardTitle>
        </CardHeader>
        <CardContent>
          <SecurityHistoryTable events={history.events} />
          {history.totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>
                Page {history.page} of {history.totalPages}
              </span>
              <div className="flex gap-2">
                {history.page > 1 && (
                  <Link className="underline" href={`/admin/users/${userId}/security-history?page=${history.page - 1}`}>
                    Previous
                  </Link>
                )}
                {history.page < history.totalPages && (
                  <Link className="underline" href={`/admin/users/${userId}/security-history?page=${history.page + 1}`}>
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
