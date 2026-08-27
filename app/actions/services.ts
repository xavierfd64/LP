"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";

export type ServiceSearchResult = {
  id: string;
  name: string;
  category: string | null;
  specFields: string[];
  workflowTemplateId: string | null;
};

/**
 * Search-as-you-type across the active Service Master — the same pattern
 * as searchCustomersForTransactionAction, and the reason Inquiry/Quotation/
 * Job Order/Order forms can drop their free-text "product type" input for a
 * professional searchable dropdown. Inactive/archived services never
 * appear here (spec: "only saved and active services"); historical
 * documents that already reference a since-deactivated service keep
 * showing it via their own denormalized snapshot text, untouched by this.
 */
export async function searchActiveServicesAction(query: string): Promise<ServiceSearchResult[]> {
  await requireUser();
  const q = query.trim();
  const services = await prisma.service.findMany({
    where: {
      active: true,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }] } : {}),
    },
    take: 10,
    orderBy: { name: "asc" },
    select: { id: true, name: true, category: true, specFields: true, workflowTemplateId: true },
  });
  return services.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    specFields: (s.specFields as string[]) ?? [],
    workflowTemplateId: s.workflowTemplateId,
  }));
}

const serviceSchema = z.object({
  name: z.string().min(2, "Service name is required."),
  description: z.string().optional(),
  category: z.string().optional(),
  workflowTemplateId: z.string().optional(),
  specFields: z.string().optional(),
});

function parseSpecFields(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createServiceAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SERVICE_MANAGE");

  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    category: formData.get("category") || undefined,
    workflowTemplateId: formData.get("workflowTemplateId") || undefined,
    specFields: formData.get("specFields") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const existing = await prisma.service.findUnique({ where: { name: parsed.data.name } });
  if (existing) return "A service with that name already exists.";

  const service = await prisma.service.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      workflowTemplateId: parsed.data.workflowTemplateId || undefined,
      specFields: parseSpecFields(parsed.data.specFields),
    },
  });

  await logAudit(user.id, "SERVICE_CREATED", "Service", service.id, { name: service.name });
  redirect(`/admin/services`);
}

/** Same create path, but returns the created service instead of redirecting — used by the inline "+ Add Service" quick-add from within a transaction form. */
export async function quickAddServiceAction(formData: FormData): Promise<
  { ok: true; service: ServiceSearchResult } | { ok: false; error: string }
> {
  const user = await requirePermission("SERVICE_MANAGE");

  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    category: formData.get("category") || undefined,
    workflowTemplateId: formData.get("workflowTemplateId") || undefined,
    specFields: formData.get("specFields") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const existing = await prisma.service.findUnique({ where: { name: parsed.data.name } });
  if (existing) return { ok: false, error: "A service with that name already exists." };

  const specFields = parseSpecFields(parsed.data.specFields);
  const service = await prisma.service.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      workflowTemplateId: parsed.data.workflowTemplateId || undefined,
      specFields,
    },
  });

  await logAudit(user.id, "SERVICE_CREATED", "Service", service.id, { name: service.name });
  return {
    ok: true,
    service: { id: service.id, name: service.name, category: service.category, specFields, workflowTemplateId: service.workflowTemplateId },
  };
}

export async function updateServiceAction(serviceId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SERVICE_MANAGE");

  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    category: formData.get("category") || undefined,
    workflowTemplateId: formData.get("workflowTemplateId") || undefined,
    specFields: formData.get("specFields") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  await prisma.service.update({
    where: { id: serviceId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      category: parsed.data.category || null,
      workflowTemplateId: parsed.data.workflowTemplateId || null,
      specFields: parseSpecFields(parsed.data.specFields),
    },
  });

  await logAudit(user.id, "SERVICE_UPDATED", "Service", serviceId, { name: parsed.data.name });
  redirect(`/admin/services`);
}

export async function toggleServiceActiveAction(serviceId: string) {
  const user = await requirePermission("SERVICE_MANAGE");
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  await prisma.service.update({ where: { id: serviceId }, data: { active: !service.active } });
  await logAudit(user.id, "SERVICE_TOGGLED", "Service", serviceId, { active: !service.active });
  revalidatePath("/admin/services");
}

/**
 * Permanent delete — a separate action from toggleServiceActiveAction
 * (deactivate stays the reversible everyday action; this is the
 * "permanently gone" one). Safe to run even for a Service already used on
 * historical Inquiries/Quotations/Job Orders: every one of those models
 * keeps its own denormalized snapshot of the service name (desiredProduct/
 * productType) independent of the live Service row, and their serviceId
 * foreign keys are all ON DELETE SET NULL (see the 20260819090000
 * migration) — so deleting the Service row only detaches the live link,
 * it never removes or corrupts the historical record itself. Only the
 * Service's own configuration rows (BOM materials, cost components,
 * pricing tiers) cascade-delete alongside it, which is correct: those are
 * the Service's configuration, not anyone's transaction history.
 */
export async function deleteServiceAction(serviceId: string) {
  const user = await requirePermission("SERVICE_MANAGE");
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  await prisma.service.delete({ where: { id: serviceId } });
  await logAudit(user.id, "SERVICE_DELETED", "Service", serviceId, { name: service.name });
  redirect(`/admin/services`);
}
