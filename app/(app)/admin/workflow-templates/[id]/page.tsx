import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EditTemplateForm } from "./edit-form";
import { toggleWorkflowTemplateActiveAction } from "@/app/actions/workflow-templates";

export default async function EditWorkflowTemplatePage({ params }: PageProps<"/admin/workflow-templates/[id]">) {
  await requireRole(["ADMIN"]);
  const { id } = await params;

  const template = await prisma.workflowTemplate.findUnique({
    where: { id },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  if (!template) notFound();

  const toggle = toggleWorkflowTemplateActiveAction.bind(null, template.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{template.name}</h1>
        <form action={toggle}>
          <Button type="submit" variant="outline" size="sm">
            {template.active ? "Deactivate" : "Activate"}
          </Button>
        </form>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Edit stages</CardTitle>
        </CardHeader>
        <CardContent>
          <EditTemplateForm
            templateId={template.id}
            name={template.name}
            stages={template.stages.map((s) => ({
              name: s.name,
              isQCStage: s.isQCStage,
              isInstallStage: s.isInstallStage,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
