import { redirect } from "next/navigation";
import Link from "next/link";
import { History } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { getPaginatedUsers } from "@/lib/users-list";
import { ListPagination } from "@/components/lists/list-pagination";
import { AddUserModal } from "./add-user-modal";
import { UserFilters } from "./user-filters";
import { EditUserModal } from "./edit-user-modal";
import { ResetPasswordModal } from "./reset-password-modal";
import { toggleUserActiveAction } from "@/app/actions/admin-users";

const PAGE_SIZE = 15;
const ROLE_TONE: Record<string, "purple" | "blue" | "green" | "slate"> = {
  ADMIN: "purple",
  STAFF: "blue",
  PRODUCTION: "green",
  CUSTOMER: "slate",
};

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const isStaffLike = isAdmin || user.role === "STAFF";
  if (!isStaffLike) redirect("/dashboard");

  const canView = isAdmin || (await can(user, "USER_VIEW"));
  if (!canView) redirect("/dashboard");

  const canCreate = isAdmin || (await can(user, "USER_CREATE"));
  const canEdit = isAdmin || (await can(user, "USER_EDIT"));
  const canResetPassword = isAdmin || (await can(user, "USER_RESET_PASSWORD"));
  const canActivateDeactivate = isAdmin || (await can(user, "USER_ACTIVATE_DEACTIVATE"));

  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const q = typeof sp.q === "string" ? sp.q : "";
  const rawRole = typeof sp.role === "string" ? sp.role : "";
  const validRoles = ["ADMIN", "STAFF", "PRODUCTION", "CUSTOMER"] as const;
  const role = (validRoles as readonly string[]).includes(rawRole) ? (rawRole as (typeof validRoles)[number]) : undefined;
  const rawStatus = typeof sp.status === "string" ? sp.status : "";
  const status = rawStatus === "active" || rawStatus === "inactive" ? rawStatus : undefined;

  const list = await getPaginatedUsers({ page, pageSize: PAGE_SIZE, q: q || undefined, role, status });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">Manage staff, production, admin, and customer accounts.</p>
        </div>
        {canCreate && <AddUserModal canCreateAdmin={isAdmin} />}
      </div>

      <Card>
        <div className="p-4">
          <UserFilters q={q} role={role ?? ""} status={status ?? ""} />
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Phone</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {list.users.map((u) => {
              const toggle = toggleUserActiveAction.bind(null, u.id);
              const canResetThis = canResetPassword && (u.role !== "ADMIN" || isAdmin);
              return (
                <TR key={u.id}>
                  <TD className="font-medium text-slate-900">{u.name}</TD>
                  <TD>{u.email}</TD>
                  <TD>
                    <Badge tone={ROLE_TONE[u.role] ?? "slate"}>{u.role}</Badge>
                  </TD>
                  <TD>{u.phone ?? "—"}</TD>
                  <TD>
                    <Badge tone={u.active ? "green" : "red"}>{u.active ? "Active" : "Deactivated"}</Badge>
                  </TD>
                  <TD>{formatDate(u.createdAt)}</TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-2">
                      {canEdit && (
                        <EditUserModal
                          user={{ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, active: u.active }}
                          canEditRole={isAdmin}
                        />
                      )}
                      {canResetThis && <ResetPasswordModal userId={u.id} name={u.name} email={u.email} />}
                      <Link href={`/admin/users/${u.id}/security-history`}>
                        <Button type="button" variant="outline" size="sm">
                          <History className="h-3.5 w-3.5" /> History
                        </Button>
                      </Link>
                      {canActivateDeactivate && u.id !== user.id && (
                        <form action={toggle}>
                          <Button type="submit" size="sm" variant={u.active ? "destructive" : "outline"}>
                            {u.active ? "Deactivate" : "Activate"}
                          </Button>
                        </form>
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {list.users.length === 0 && <EmptyState label="No users match these filters." />}
        <div className="px-4 pb-4">
          <ListPagination basePath="/admin/users" page={list.page} totalPages={list.totalPages} total={list.total} pageSize={list.pageSize} itemLabel="users" searchParams={sp} />
        </div>
      </Card>
    </div>
  );
}
