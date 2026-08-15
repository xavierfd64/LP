"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { nextOrderNumber, nextJoNumber } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { startProduction, RuleViolation } from "@/lib/workflow";
import { notifyCustomer } from "@/lib/notifications";

const orderSchema = z.object({
  customerId: z.string().min(1),
  quotationId: z.string().optional(),
  totalAmount: z.coerce.number().nonnegative(),
  paymentTermType: z.enum(["STANDARD_PARTIAL", "APPROVED_TERMS"]),
  requiredPartialPct: z.coerce.number().int().min(0).max(100).default(50),
  termsApprovedBy: z.string().optional(),
  termsReason: z.string().optional(),
});

export async function createOrderAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["STAFF", "ADMIN"]);

  const parsed = orderSchema.safeParse({
    customerId: formData.get("customerId"),
    quotationId: formData.get("quotationId") || undefined,
    totalAmount: formData.get("totalAmount"),
    paymentTermType: formData.get("paymentTermType"),
    requiredPartialPct: formData.get("requiredPartialPct") || 50,
    termsApprovedBy: formData.get("termsApprovedBy") || undefined,
    termsReason: formData.get("termsReason") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const data = parsed.data;
  if (data.paymentTermType === "APPROVED_TERMS" && !data.termsApprovedBy) {
    return "Approved-terms orders require who authorized the exception.";
  }

  const orderNumber = await nextOrderNumber();

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
  productType: z.string().min(1),
  description: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  workflowTemplateId: z.string().min(1),
  deadline: z.string().optional(),
});

export async function createJobOrderAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["STAFF", "ADMIN"]);

  const parsed = jobOrderSchema.safeParse({
    orderId: formData.get("orderId"),
    productType: formData.get("productType"),
    description: formData.get("description"),
    quantity: formData.get("quantity"),
    workflowTemplateId: formData.get("workflowTemplateId"),
    deadline: formData.get("deadline") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const data = parsed.data;
  const joNumber = await nextJoNumber(data.orderId);

  const jo = await prisma.jobOrder.create({
    data: {
      orderId: data.orderId,
      joNumber,
      productType: data.productType,
      description: data.description,
      quantity: data.quantity,
      workflowTemplateId: data.workflowTemplateId,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      status: "ON_HOLD",
    },
  });

  await prisma.order.update({ where: { id: data.orderId }, data: { status: "OPEN" } });

  await logAudit(user.id, "JOB_ORDER_CREATED", "JobOrder", jo.id, { joNumber, orderId: data.orderId });

  redirect(`/orders/${data.orderId}`);
}

export async function startProductionAction(jobOrderId: string) {
  const user = await requireRole(["STAFF", "ADMIN", "PRODUCTION"]);
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
