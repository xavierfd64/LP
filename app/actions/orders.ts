"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { nextOrderNumber, nextJoNumber } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { startProduction, RuleViolation } from "@/lib/workflow";
import { notifyCustomer } from "@/lib/notifications";
import { estimateCostForLines } from "@/lib/service-cost";

const orderSchema = z.object({
  customerId: z.string().min(1),
  quotationId: z.string().optional(),
  totalAmount: z.coerce.number().nonnegative(),
  paymentTermType: z.enum(["STANDARD_PARTIAL", "APPROVED_TERMS"]),
  requiredPartialPct: z.coerce.number().int().min(0).max(100).default(50),
  termsApprovedBy: z.string().optional(),
  termsReason: z.string().optional(),
  dueDate: z.string().optional(),
});

export async function createOrderAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("ORDER_CREATE");

  const parsed = orderSchema.safeParse({
    customerId: formData.get("customerId"),
    quotationId: formData.get("quotationId") || undefined,
    totalAmount: formData.get("totalAmount"),
    paymentTermType: formData.get("paymentTermType"),
    requiredPartialPct: formData.get("requiredPartialPct") || 50,
    termsApprovedBy: formData.get("termsApprovedBy") || undefined,
    termsReason: formData.get("termsReason") || undefined,
    dueDate: formData.get("dueDate") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const data = parsed.data;
  if (data.paymentTermType === "APPROVED_TERMS" && !data.termsApprovedBy) {
    return "Approved-terms orders require who authorized the exception.";
  }

  const orderNumber = await nextOrderNumber();

  // Cost snapshot (Aug 20 4th update, Part D item 26/34) — taken once, right
  // now, from the linked Quotation's line items as they cost out at this
  // exact moment. A Service's BOM changing tomorrow must never silently
  // rewrite what this Order's production cost was at creation time, so
  // this is stored, not recomputed live on every future page view.
  let costSnapshot: { totalCost: number; fullyConfigured: boolean } | null = null;
  if (data.quotationId) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: data.quotationId },
      include: { lineItems: true },
    });
    if (quotation) {
      const estimate = await estimateCostForLines(
        quotation.lineItems.map((li) => ({ serviceId: li.serviceId, qty: li.qty, sellingAmount: Number(li.unitPrice) * li.qty }))
      );
      costSnapshot = { totalCost: estimate.totalCost, fullyConfigured: estimate.fullyConfigured };
    }
  }

  const order = await prisma.order.create({
    data: {
      orderNumber,
      customerId: data.customerId,
      quotationId: data.quotationId,
      totalAmount: data.totalAmount,
      paymentTermType: data.paymentTermType,
      requiredPartialPct: data.requiredPartialPct,
      termsApprovedBy: data.paymentTermType === "APPROVED_TERMS" ? data.termsApprovedBy : undefined,
      termsReason: data.paymentTermType === "APPROVED_TERMS" ? data.termsReason : undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      estimatedProductionCostSnapshot: costSnapshot?.fullyConfigured ? costSnapshot.totalCost : null,
      costSnapshotFullyConfigured: costSnapshot?.fullyConfigured ?? false,
      costSnapshotTakenAt: costSnapshot ? new Date() : null,
    },
  });

  await logAudit(user.id, "ORDER_CREATED", "Order", order.id, {
    orderNumber,
    paymentTermType: data.paymentTermType,
  });
  if (data.paymentTermType === "APPROVED_TERMS") {
    await logAudit(user.id, "PAYMENT_TERMS_EXCEPTION_GRANTED", "Order", order.id, {
      termsApprovedBy: data.termsApprovedBy,
      termsReason: data.termsReason,
    });
  }

  await notifyCustomer(
    data.customerId,
    "ORDER_CREATED",
    `Your order ${orderNumber} has been created.`,
    `/orders/${order.id}`
  );

  redirect(`/orders/${order.id}`);
}

const jobOrderSchema = z.object({
  orderId: z.string().min(1),
  serviceId: z.string().min(1, "Please select a service."),
  specs: z.string().optional(),
  description: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  workflowTemplateId: z.string().min(1),
  deadline: z.string().optional(),
  productionInstructions: z.string().optional(),
});

export async function createJobOrderAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("ORDER_MODIFY");

  const parsed = jobOrderSchema.safeParse({
    orderId: formData.get("orderId"),
    serviceId: formData.get("serviceId"),
    specs: formData.get("specs") || undefined,
    description: formData.get("description"),
    quantity: formData.get("quantity"),
    workflowTemplateId: formData.get("workflowTemplateId"),
    deadline: formData.get("deadline") || undefined,
    productionInstructions: formData.get("productionInstructions") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const data = parsed.data;

  const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
  if (!service || !service.active) return "Please select a valid, active service.";

  let specs: Record<string, string> | undefined;
  if (data.specs) {
    try {
      specs = JSON.parse(data.specs);
    } catch {
      specs = undefined;
    }
  }

  const joNumber = await nextJoNumber(data.orderId);

  const jo = await prisma.jobOrder.create({
    data: {
      orderId: data.orderId,
      joNumber,
      productType: service.name,
      serviceId: service.id,
      specs,
      description: data.description,
      quantity: data.quantity,
      workflowTemplateId: data.workflowTemplateId,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      productionInstructions: data.productionInstructions,
      status: "ON_HOLD",
    },
  });

  const order = await prisma.order.update({ where: { id: data.orderId }, data: { status: "OPEN" } });

  await logAudit(user.id, "JOB_ORDER_CREATED", "JobOrder", jo.id, { joNumber, orderId: data.orderId });
  await notifyCustomer(order.customerId, "JOB_ORDER_CREATED", `Job order ${joNumber} has been created for your order ${order.orderNumber}.`, `/orders/${data.orderId}`);

  redirect(`/orders/${data.orderId}`);
}

export async function startProductionAction(jobOrderId: string) {
  const user = await requirePermission("PRODUCTION_UPDATE_STAGE", ["PRODUCTION"]);
  const jo = await prisma.jobOrder.findUniqueOrThrow({ where: { id: jobOrderId } });

  try {
    await startProduction(jobOrderId, user.id);
  } catch (e) {
    if (e instanceof RuleViolation) {
      redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }

  redirect(`/job-orders/${jo.id}`);
}
