import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { NewUserForm } from "./new-user-form";

export default async function AdminUsersPage() {
  await requireRole(["ADMIN"]);

  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">Staff, production, and admin accounts. Customers self-register.</p>
        </div>
        <NewUserForm />
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Phone</TH>
              <TH>Created</TH>
            </TR>
          </THead>
          <TBody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium text-slate-900">{u.name}</TD>
                <TD>{u.email}</TD>
                <TD>
                  <Badge tone="slate">{u.role}</Badge>
                </TD>
                <TD>{u.phone ?? "—"}</TD>
                <TD>{formatDate(u.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {users.length === 0 && <EmptyState label="No users yet." />}
      </Card>
    </div>
  );
}
