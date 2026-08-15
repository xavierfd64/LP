import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { ALL_PERMISSIONS } from "@/lib/permissions";

export default async function StaffPermissionsPage() {
  await requireRole(["ADMIN"]);

  const staff = await prisma.user.findMany({
    where: { role: "STAFF" },
    include: { _count: { select: { staffPermissions: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Staff & Permissions</h1>
        <p className="text-sm text-slate-500">
          Control exactly what each Staff member can access. Admin is always unrestricted.
        </p>
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Status</TH>
              <TH>Permissions granted</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {staff.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium text-slate-900">{u.name}</TD>
                <TD>{u.email}</TD>
                <TD>
                  <Badge tone={u.active ? "green" : "red"}>{u.active ? "Active" : "Deactivated"}</Badge>
                </TD>
                <TD>
                  {u._count.staffPermissions} / {ALL_PERMISSIONS.length}
                </TD>
                <TD>
                  <Link href={`/admin/staff-permissions/${u.id}`} className="text-sm font-medium text-slate-900 underline">
                    Configure
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {staff.length === 0 && <EmptyState label="No staff accounts yet. Create one from the Users page." />}
      </Card>
    </div>
  );
}
