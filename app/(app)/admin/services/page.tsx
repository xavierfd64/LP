import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { ToggleActiveButton } from "./toggle-active-button";
import { computeServiceCostingCoverage } from "@/lib/service-costing";

export default async function ServicesPage() {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "SERVICE_VIEW"))) redirect("/dashboard");
  const canManage = user.role === "ADMIN" || (await can(user, "SERVICE_MANAGE"));
  const canViewCost = user.role === "ADMIN" || (await can(user, "COST_VIEW"));

  const [services, coverage] = await Promise.all([
    prisma.service.findMany({
      include: { workflowTemplate: { include: { stages: { orderBy: { order: "asc" } } } }, _count: { select: { jobOrders: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    canViewCost ? computeServiceCostingCoverage() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Service / Product Master</h1>
          <p className="text-sm text-slate-500">
            The single source of truth for what customers can request — only active services appear in new
            transaction dropdowns.
          </p>
        </div>
        {canManage && (
          <Link href="/admin/services/new">
            <Button>+ Add Service</Button>
          </Link>
        )}
      </div>

      {canViewCost && coverage && coverage.totalCount > 0 && (
        <Card className="px-5 py-4">
          <p className="text-xs uppercase text-slate-500">Services With Costing</p>
          <p className="text-2xl font-bold text-slate-900">
            {coverage.configuredCount} / {coverage.totalCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {Math.round((coverage.configuredCount / coverage.totalCount) * 100)}% costing coverage
            {coverage.partialCount > 0 && ` · ${coverage.partialCount} partially configured`}
          </p>
        </Card>
      )}

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Category</TH>
              <TH>Production Flow</TH>
              <TH>Job Orders</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {services.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium text-slate-900">{s.name}</TD>
                <TD className="text-sm text-slate-500">{s.category ?? "—"}</TD>
                <TD className="text-sm text-slate-600">
                  {s.workflowTemplate ? s.workflowTemplate.stages.map((st) => st.name).join(" → ") : "Not assigned"}
                </TD>
                <TD>{s._count.jobOrders}</TD>
                <TD>
                  <Badge tone={s.active ? "green" : "slate"}>{s.active ? "Active" : "Inactive"}</Badge>
                </TD>
                <TD className="flex items-center gap-2">
                  {canManage && (
                    <>
                      <Link href={`/admin/services/${s.id}`} className="text-sm font-medium text-brand-600 underline">
                        Edit
                      </Link>
                      <ToggleActiveButton serviceId={s.id} active={s.active} />
                    </>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {services.length === 0 && <EmptyState label="No services yet." />}
      </Card>
    </div>
  );
}
