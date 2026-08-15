import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Permission } from "@/lib/permissions";
import { updateStaffPermissionsAction } from "@/app/actions/admin-users";
import { StaffPermissionsForm } from "./staff-permissions-form";

export default async function StaffPermissionsDetailPage({ params }: PageProps<"/admin/staff-permissions/[userId]">) {
  await requireRole(["ADMIN"]);
  const { userId } = await params;

  const staff = await prisma.user.findUnique({
    where: { id: userId },
    include: { staffPermissions: { select: { permission: true } } },
  });
  if (!staff || staff.role !== "STAFF") notFound();

  const action = updateStaffPermissionsAction.bind(null, staff.id);
  const initialGranted = staff.staffPermissions.map((sp) => sp.permission as Permission);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/admin/staff-permissions" className="text-sm text-slate-500 underline">
          ← Staff & Permissions
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{staff.name}</h1>
          <Badge tone="slate">Staff</Badge>
          <Badge tone={staff.active ? "green" : "red"}>{staff.active ? "Active" : "Deactivated"}</Badge>
        </div>
        <p className="text-sm text-slate-500">{staff.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <StaffPermissionsForm action={action} initialGranted={initialGranted} />
        </CardContent>
      </Card>
    </div>
  );
}
