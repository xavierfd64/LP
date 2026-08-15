import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { NewUserForm } from "./new-user-form";
import { toggleUserActiveAction } from "@/app/actions/admin-users";

export default async function AdminUsersPage() {
  const admin = await requireRole(["ADMIN"]);

  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">Staff, production, and admin accounts. Customers self-register.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/staff-permissions">
            <Button variant="outline">Staff & Permissions</Button>
          </Link>
          <NewUserForm />
        </div>
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Phone</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {users.map((u) => {
              const toggle = toggleUserActiveAction.bind(null, u.id);
              return (
                <TR key={u.id}>
                  <TD className="font-medium text-slate-900">{u.name}</TD>
                  <TD>{u.email}</TD>
                  <TD>
                    <Badge tone="slate">{u.role}</Badge>
                  </TD>
                  <TD>{u.phone ?? "—"}</TD>
                  <TD>
                    <Badge tone={u.active ? "green" : "red"}>{u.active ? "Active" : "Deactivated"}</Badge>
                  </TD>
                  <TD>{formatDate(u.createdAt)}</TD>
                  <TD>
                    {u.id !== admin.id && (
                      <form action={toggle}>
                        <Button type="submit" size="sm" variant={u.active ? "destructive" : "outline"}>
                          {u.active ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {users.length === 0 && <EmptyState label="No users yet." />}
      </Card>
    </div>
  );
}
