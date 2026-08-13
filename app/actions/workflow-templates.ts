"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";

const stageSchema = z.object({
  name: z.string().min(1),
  isQCStage: z.coerce.boolean(),
  isInstallStage: z.coerce.boolean(),
});

function parseStages(formData: FormData) {
  const names = formData.getAll("stageName") as string[];
  const isQC = formData.getAll("stageIsQC") as string[];
  const isInstall = formData.getAll("stageIsInstall") as string[];

  return names.map((name, i) => ({
    name,
    isQCStage: isQC[i] === "true",
    isInstallStage: isInstall[i] === "true",
  }));
}

export async function createWorkflowTemplateAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return "Template name is required.";

  const rawStages = parseStages(formData);
  const parsed = z.array(stageSchema).min(1, "Add at least one stage.").safeParse(rawStages);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid stages.";
  if (!parsed.data.some((s) => s.isQCStage)) return "Exactly one stage must be marked as the QC stage.";
  if (parsed.data.filter((s) => s.isQCStage).length > 1) return "Only one stage can be marked as the QC stage.";

  const existing = await prisma.workflowTemplate.findUnique({ where: { name } });
  if (existing) return "A template with that name already exists.";

  const template = await prisma.workflowTemplate.create({
    data: {
      name,
      stages: {
        create: parsed.data.map((s, i) => ({ ...s, order: i + 1 })),
      },
    },
  });

  await logAudit(user.id, "WORKFLOW_TEMPLATE_CREATED", "WorkflowTemplate", template.id, { name });

  redirect(`/admin/workflow-templates/${template.id}`);
}

export async function updateWorkflowTemplateAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);

  const templateId = String(formData.get("templateId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!templateId || !name) return "Invalid request.";

  const rawStages = parseStages(formData);
  const parsed = z.array(stageSchema).min(1, "Add at least one stage.").safeParse(rawStages);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid stages.";
  if (!parsed.data.some((s) => s.isQCStage)) return "Exactly one stage must be marked as the QC stage.";
  if (parsed.data.filter((s) => s.isQCStage).length > 1) return "Only one stage can be marked as the QC stage.";

  await prisma.$transaction([
    prisma.workflowStage.deleteMany({ where: { templateId } }),
    prisma.workflowTemplate.update({
      where: { id: templateId },
      data: {
        name,
        stages: { create: parsed.data.map((s, i) => ({ ...s, order: i + 1 })) },
      },
    }),
  ]);

  await logAudit(user.id, "WORKFLOW_TEMPLATE_UPDATED", "WorkflowTemplate", templateId, { name });

  redirect(`/admin/workflow-templates/${templateId}`);
}

export async function toggleWorkflowTemplateActiveAction(templateId: string) {
  const user = await requireRole(["ADMIN"]);
  const template = await prisma.workflowTemplate.findUniqueOrThrow({ where: { id: templateId } });
  await prisma.workflowTemplate.update({ where: { id: templateId }, data: { active: !template.active } });
  await logAudit(user.id, "WORKFLOW_TEMPLATE_TOGGLED", "WorkflowTemplate", templateId, { active: !template.active });
  redirect(`/admin/workflow-templates/${templateId}`);
}
