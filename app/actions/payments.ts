"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { logAudit } from "@/lib/audit";
import { saveUploadedFile } from "@/lib/upload";
import { assertCanRelease, RuleViolation } from "@/lib/workflow";
import { notify } from "@/lib/notify";

const recordPaymentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.coerce.number().positive(),
  method: z.enum(["CASH", "BANK_TRANSFER", "GCASH", "CHEQUE", "OTHER"]),
  notes: z.string().optional(),
});

export async function recordPaymentAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["STAFF", "ADMIN"]);

  const parsed = recordPaymentSchema.safeParse({
    orderId: formData.get("orderId"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const payment = await prisma.payment.create({
    data: {
      ...parsed.data,
      status: "CONFIRMED",
      recordedById: user.id,
    },
  });

  await logAudit(user.id, "PAYMENT_RECORDED", "Payment", payment.id, {
    orderId: parsed.data.orderId,
    amount: parsed.data.amount,
    status: "CONFIRMED",
  });

  redirect(`/orders/${parsed.data.orderId}`);
}

export async function uploadPaymentProofAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");

  const orderId = String(formData.get("orderId") ?? "");
  const amountRaw = formData.get("amount");
  const file = formData.get("proofFile") as File | null;

  const amount = Number(amountRaw);
  if (!orderId || !amount || amount <= 0) return "Please enter a valid amount.";
  if (!file || file.size === 0) return "Please attach a proof of payment file.";

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const customer = await getCurrentCustomer(user.id);
  if (order.customerId !== customer.id) throw new Error("Not allowed.");

  const saved = await saveUploadedFile(file);

  const payment = await prisma.payment.create({
    data: {
      orderId,
      amount,
      method: "GCASH",
      status: "PENDING",
      proofFilePath: saved.path,
      recordedById: user.id,
      notes: `Uploaded by customer: ${saved.filename}`,
    },
  });

  await logAudit(user.id, "PAYMENT_PROOF_UPLOADED", "Payment", payment.id, { orderId, amount });
  notify("staff", `Customer uploaded payment proof for order ${orderId}.`);

  redirect(`/orders/${orderId}`);
}

export async function confirmPaymentAction(paymentId: string) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  const payment = await prisma.payment.update({ where: { id: paymentId }, data: { status: "CONFIRMED" } });
  await logAudit(user.id, "PAYMENT_CONFIRMED", "Payment", paymentId, { orderId: payment.orderId });
  redirect(`/payments`);
}

export async function rejectPaymentAction(paymentId: string) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  const payment = await prisma.payment.update({ where: { id: paymentId }, data: { status: "REJECTED" } });
  await logAudit(user.id, "PAYMENT_REJECTED", "Payment", paymentId, { orderId: payment.orderId });
  redirect(`/payments`);
}

const releaseExceptionSchema = z.object({
  orderId: z.string().min(1),
  releaseExceptionBy: z.string().min(1, "Enter who authorized the exception."),
  releaseExceptionReason: z.string().min(1, "Enter a reason."),
});

export async function grantReleaseExceptionAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  const parsed = releaseExceptionSchema.safeParse({
    orderId: formData.get("orderId"),
    releaseExceptionBy: formData.get("releaseExceptionBy"),
    releaseExceptionReason: formData.get("releaseExceptionReason"),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  await prisma.order.update({
    where: { id: parsed.data.orderId },
    data: {
      releaseException: true,
      releaseExceptionBy: parsed.data.releaseExceptionBy,
      releaseExceptionReason: parsed.data.releaseExceptionReason,
    },
  });

  await logAudit(user.id, "RELEASE_EXCEPTION_GRANTED", "Order", parsed.data.orderId, {
    releaseExceptionBy: parsed.data.releaseExceptionBy,
    releaseExceptionReason: parsed.data.releaseExceptionReason,
  });

  redirect(`/orders/${parsed.data.orderId}`);
}

export async function releaseJobOrderAction(jobOrderId: string) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  const jo = await prisma.jobOrder.findUniqueOrThrow({ where: { id: jobOrderId } });

  if (jo.status !== "READY") {
    redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent("Job order must be READY (passed QC/packing) before release.")}`);
  }

  try {
    await assertCanRelease(jo.orderId);
  } catch (e) {
    if (e instanceof RuleViolation) {
      redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }

  await prisma.jobOrder.update({ where: { id: jobOrderId }, data: { status: "RELEASED" } });
  await logAudit(user.id, "JOB_ORDER_RELEASED", "JobOrder", jobOrderId, {});

  redirect(`/job-orders/${jobOrderId}`);
}
