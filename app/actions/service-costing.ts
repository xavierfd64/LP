"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";

/**
 * BOM / production-costing configuration (Aug 20 4th update, Part D).
 * Reuses the existing SERVICE_MANAGE permission — configuring cost
 * components is just one more part of managing a Service, same as the
 * pricing fields added in the 1st update, not a new capability that needs
 * its own permission key.
 */

const materialSchema = z.object({
  inventoryItemId: z.string().min(1, "Please select a material."),
  consumptionPerUnit: z.coerce.number().positive("Enter a valid consumption amount."),
  wastePercent: z.coerce.number().min(0).max(100).optional(),
});

function parseMaterialForm(formData: FormData) {
  return materialSchema.safeParse({
    inventoryItemId: formData.get("inventoryItemId"),
    consumptionPerUnit: formData.get("consumptionPerUnit"),
    wastePercent: formData.get("wastePercent") || undefined,
  });
}

export async function addBOMMaterialAction(serviceId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SERVICE_MANAGE");

  const parsed = parseMaterialForm(formData);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;

  const [service, item] = await Promise.all([
    prisma.service.findUniqueOrThrow({ where: { id: serviceId } }),
    prisma.inventoryItem.findUniqueOrThrow({ where: { id: data.inventoryItemId } }),
  ]);

  const material = await prisma.serviceBOMMaterial.create({
    data: {
      serviceId,
      inventoryItemId: data.inventoryItemId,
      consumptionPerUnit: data.consumptionPerUnit,
      wastePercent: data.wastePercent ?? null,
    },
  });

  await logAudit(user.id, "BOM_MATERIAL_ADDED", "Service", serviceId, {
    service: service.name,
    material: item.name,
    consumptionPerUnit: data.consumptionPerUnit,
  });

  redirect(`/admin/services/${serviceId}/costing`);
}

export async function updateBOMMaterialAction(materialId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SERVICE_MANAGE");

  const parsed = parseMaterialForm(formData);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;

  const existing = await prisma.serviceBOMMaterial.findUniqueOrThrow({
    where: { id: materialId },
    include: { service: true, inventoryItem: true },
  });

  await prisma.serviceBOMMaterial.update({
    where: { id: materialId },
    data: {
      inventoryItemId: data.inventoryItemId,
      consumptionPerUnit: data.consumptionPerUnit,
      wastePercent: data.wastePercent ?? null,
    },
  });

  await logAudit(user.id, "BOM_MATERIAL_UPDATED", "Service", existing.serviceId, {
    service: existing.service.name,
    material: existing.inventoryItem.name,
  });

  redirect(`/admin/services/${existing.serviceId}/costing`);
}

export async function removeBOMMaterialAction(materialId: string) {
  const user = await requirePermission("SERVICE_MANAGE");
  const existing = await prisma.serviceBOMMaterial.findUniqueOrThrow({
    where: { id: materialId },
    include: { service: true, inventoryItem: true },
  });

  await prisma.serviceBOMMaterial.delete({ where: { id: materialId } });

  await logAudit(user.id, "BOM_MATERIAL_REMOVED", "Service", existing.serviceId, {
    service: existing.service.name,
    material: existing.inventoryItem.name,
  });

  redirect(`/admin/services/${existing.serviceId}/costing`);
}

const componentSchema = z.object({
  category: z.enum(["LABOR", "MACHINE", "FINISHING", "OTHER"]),
  label: z.string().trim().min(1, "Label is required.").max(80),
  basis: z.enum(["PER_UNIT", "PER_HOUR", "FLAT"]),
  rate: z.coerce.number().nonnegative("Enter a valid rate."),
  estimatedHours: z.coerce.number().positive().optional(),
});

function parseComponentForm(formData: FormData) {
  return componentSchema.safeParse({
    category: formData.get("category"),
    label: formData.get("label"),
    basis: formData.get("basis"),
    rate: formData.get("rate"),
    estimatedHours: formData.get("estimatedHours") || undefined,
  });
}

export async function addCostComponentAction(serviceId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SERVICE_MANAGE");

  const parsed = parseComponentForm(formData);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;
  if (data.basis === "PER_HOUR" && data.estimatedHours == null) return "Estimated hours is required for a per-hour cost.";

  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });

  await prisma.serviceCostComponent.create({
    data: {
      serviceId,
      category: data.category,
      label: data.label,
      basis: data.basis,
      rate: data.rate,
      estimatedHours: data.basis === "PER_HOUR" ? data.estimatedHours : null,
    },
  });

  await logAudit(user.id, "SERVICE_COST_COMPONENT_ADDED", "Service", serviceId, {
    service: service.name,
    label: data.label,
    category: data.category,
  });

  redirect(`/admin/services/${serviceId}/costing`);
}

export async function updateCostComponentAction(componentId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SERVICE_MANAGE");

  const parsed = parseComponentForm(formData);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;
  if (data.basis === "PER_HOUR" && data.estimatedHours == null) return "Estimated hours is required for a per-hour cost.";

  const existing = await prisma.serviceCostComponent.findUniqueOrThrow({ where: { id: componentId }, include: { service: true } });

  await prisma.serviceCostComponent.update({
    where: { id: componentId },
    data: {
      category: data.category,
      label: data.label,
      basis: data.basis,
      rate: data.rate,
      estimatedHours: data.basis === "PER_HOUR" ? data.estimatedHours : null,
    },
  });

  await logAudit(user.id, "SERVICE_COST_COMPONENT_UPDATED", "Service", existing.serviceId, {
    service: existing.service.name,
    label: data.label,
  });

  redirect(`/admin/services/${existing.serviceId}/costing`);
}

export async function removeCostComponentAction(componentId: string) {
  const user = await requirePermission("SERVICE_MANAGE");
  const existing = await prisma.serviceCostComponent.findUniqueOrThrow({ where: { id: componentId }, include: { service: true } });

  await prisma.serviceCostComponent.delete({ where: { id: componentId } });

  await logAudit(user.id, "SERVICE_COST_COMPONENT_REMOVED", "Service", existing.serviceId, {
    service: existing.service.name,
    label: existing.label,
  });

  redirect(`/admin/services/${existing.serviceId}/costing`);
}

const targetMarginSchema = z.object({
  targetMarginPct: z.coerce.number().min(0).max(99.99).optional(),
});

export async function updateTargetMarginAction(serviceId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SERVICE_MANAGE");

  const parsed = targetMarginSchema.safeParse({ targetMarginPct: formData.get("targetMarginPct") || undefined });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  await prisma.service.update({ where: { id: serviceId }, data: { targetMarginPct: parsed.data.targetMarginPct ?? null } });

  await logAudit(user.id, "SERVICE_TARGET_MARGIN_UPDATED", "Service", serviceId, {
    service: service.name,
    targetMarginPct: parsed.data.targetMarginPct ?? null,
  });

  redirect(`/admin/services/${serviceId}/costing`);
}
