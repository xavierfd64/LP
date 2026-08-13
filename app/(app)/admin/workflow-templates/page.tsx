import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";

export default async function WorkflowTemplatesPage() {
  await requireRole(["ADMIN"]);

  const templates = await prisma.workflowTemplate.findMany({
    include: { stages: { orderBy: { order: "asc" } }, _count: { select: { jobOrders: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workflow Templates</h1>
          <p className="text-sm text-slate-500">Define the production stages for each product type.</p>
        </div>
        <Link href="/admin/workflow-templates/new">
          <Button>New Template</Button>
        </Link>
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Stages</TH>
              <TH>Job Orders</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {templates.map((t) => (
              <TR key={t.id}>
                <TD className="font-medium text-slate-900">{t.name}</TD>
                <TD className="text-sm text-slate-600">{t.stages.map((s) => s.name).join(" → ")}</TD>
                <TD>{t._count.jobOrders}</TD>
                <TD>
                  <Badge tone={t.active ? "green" : "slate"}>{t.active ? "Active" : "Inactive"}</Badge>
                </TD>
                <TD>
                  <Link href={`/admin/workflow-templates/${t.id}`} className="text-sm font-medium text-slate-900 underline">
                    Edit
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {templates.length === 0 && <EmptyState label="No workflow templates yet." />}
      </Card>
    </div>
  );
}
