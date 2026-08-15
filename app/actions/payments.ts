"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { logAudit } from "@/lib/audit";
import { saveUploadedFile } from "@/lib/upload";
import { assertCanRelease, paymentSummary, RuleViolation } from "@/lib/workflow";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";

const recordPaymentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.coerce.number().positive(),
  method: z.enum(["CASH", "BANK_TRANSFER", "GCASH", "MAYA", "CHEQUE", "OTHER"]),
  referenceNumber: z.string().optional(),
  paymentDate: z.string().optional(),
  notes: z.string().optional(),
});

// Customers upload proof for these methods only; Cash is recorded directly
// by staff (no proof to upload), and Voucher redemption is self-verifying
// (see applyVoucherAction) so it never needs a proof upload either.
const CUSTOMER_PROOF_METHODS = ["GCASH", "MAYA", "BANK_TRANSFER", "OTHER"] as const;

export async function recordPaymentAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["STAFF", "ADMIN"]);

  const parsed = recordPaymentSchema.safeParse({
    orderId: formData.get("orderId"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    referenceNumber: formData.get("referenceNumber") || undefined,
    paymentDate: formData.get("paymentDate") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const { orderId, amount, method, referenceNumber, paymentDate, notes } = parsed.data;

  const payment = await prisma.payment.create({
    data: {
      orderId,
      amount,
      method,
      referenceNumber,
      paymentDate: paymentDate ? new Date(paymentDate) : undefined,
      notes,
      status: "CONFIRMED",
      recordedById: user.id,
    },
  });

  await logAudit(user.id, "PAYMENT_RECORDED", "Payment", payment.id, {
    orderId,
    amount,
    status: "CONFIRMED",
  });

  redirect(`/orders/${orderId}`);
}

export async function uploadPaymentProofAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");

  const orderId = String(formData.get("orderId") ?? "");
  const amountRaw = formData.get("amount");
  const methodRaw = formData.get("method");
  const file = formData.get("proofFile") as File | null;

  const amount = Number(amountRaw);
  if (!orderId || !amount || amount <= 0) return "Please enter a valid amount.";
  if (!CUSTOMER_PROOF_METHODS.includes(methodRaw as (typeof CUSTOMER_PROOF_METHODS)[number])) {
    return "Please choose a payment method.";
  }
  const method = methodRaw as (typeof CUSTOMER_PROOF_METHODS)[number];
  if (!file || file.size === 0) return "Please attach a proof of payment file.";

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const customer = await getCurrentCustomer(user.id);
  if (order.customerId !== customer.id) throw new Error("Not allowed.");

  const saved = await saveUploadedFile(file);

  const payment = await prisma.payment.create({
    data: {
      orderId,
      amount,
      method,
      status: "PENDING",
      proofFilePath: saved.path,
      recordedById: user.id,
      notes: `Uploaded by customer: ${saved.filename}`,
    },
  });

  await logAudit(user.id, "PAYMENT_PROOF_UPLOADED", "Payment", payment.id, { orderId, amount, method });
  await notifyStaff("PAYMENT_PROOF_UPLOADED", `Customer uploaded a payment proof for order ${order.orderNumber}.`, `/orders/${orderId}`);

  redirect(`/orders/${orderId}`);
}

export async function confirmPaymentAction(paymentId: string) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "CONFIRMED" },
    include: { order: true },
  });
  await logAudit(user.id, "PAYMENT_CONFIRMED", "Payment", paymentId, { orderId: payment.orderId });
  await notifyCustomer(
    payment.order.customerId,
    "PAYMENT_CONFIRMED",
    `Your payment of ${Number(payment.amount).toFixed(2)} for order ${payment.order.orderNumber} was confirmed.`,
    `/orders/${payment.orderId}`
  );
  redirect(`/payments`);
}

export async function rejectPaymentAction(paymentId: string) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "REJECTED" },
    include: { order: true },
  });
  await logAudit(user.id, "PAYMENT_REJECTED", "Payment", paymentId, { orderId: payment.orderId });
  await notifyCustomer(
    payment.order.customerId,
    "PAYMENT_REJECTED",
    `Your payment of ${Number(payment.amount).toFixed(2)} for order ${payment.order.orderNumber} was rejected. Please check the proof and try again.`,
    `/orders/${payment.orderId}`
  );
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

export async function sendBalanceReminderAction(orderId: string) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const summary = await paymentSummary(orderId);
  const balanceDue = summary.total - summary.confirmed;
  if (balanceDue <= 0) redirect(`/orders/${orderId}`);

  await notifyCustomer(
    order.customerId,
    "BALANCE_REMINDER",
    `Reminder: order ${order.orderNumber} has an outstanding balance of ${balanceDue.toFixed(2)}.`,
    `/orders/${orderId}`
  );
  await logAudit(user.id, "BALANCE_REMINDER_SENT", "Order", orderId, { balanceDue });

  redirect(`/orders/${orderId}`);
}

const applyVoucherSchema = z.object({
  orderId: z.string().min(1),
  voucherId: z.string().min(1),
});

/**
 * Customer applies one of their AVAILABLE vouchers to an order's balance.
 * Self-verifying (it's deducted from the customer's own already-confirmed
 * points ledger), so unlike other customer-initiated payments it's
 * CONFIRMED immediately — no staff review needed.
 *
 * Default (not explicitly confirmed by the business owner): the voucher's
 * minimum-spend requirement is checked against the order's total amount,
 * and at most the remaining balance due is applied (no "change" credited
 * back if the voucher is worth more than what's owed).
 */
export async function applyVoucherAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");

  const parsed = applyVoucherSchema.safeParse({
    orderId: formData.get("orderId"),
    voucherId: formData.get("voucherId"),
  });
  if (!parsed.success) return "Please select a voucher.";

  const customer = await getCurrentCustomer(user.id);
  const order = await prisma.order.findUniqueOrThrow({ where: { id: parsed.data.orderId } });
  if (order.customerId !== customer.id) throw new Error("Not allowed.");

  const voucher = await prisma.voucher.findUniqueOrThrow({ where: { id: parsed.data.voucherId } });
  if (voucher.customerId !== customer.id) throw new Error("Not allowed.");
  if (voucher.status !== "AVAILABLE") return "This voucher has already been used.";
  if (Number(order.totalAmount) < voucher.minimumSpend) {
    return `This voucher requires a minimum order of ${voucher.minimumSpend}.`;
  }

  const summary = await paymentSummary(order.id);
  const balanceDue = summary.total - summary.confirmed;
  if (balanceDue <= 0) return "This order has no remaining balance.";

  const appliedAmount = Math.min(voucher.value, balanceDue);

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        orderId: order.id,
        amount: appliedAmount,
        method: "VOUCHER",
        status: "CONFIRMED",
        voucherId: voucher.id,
        recordedById: user.id,
        notes: `Voucher ${voucher.code} applied`,
      },
    });
    await tx.voucher.update({ where: { id: voucher.id }, data: { status: "USED" } });
    return p;
  });

  await logAudit(user.id, "VOUCHER_APPLIED", "Payment", payment.id, {
    orderId: order.id,
    voucherId: voucher.id,
    appliedAmount,
  });
  await notifyCustomer(
    customer.id,
    "VOUCHER_USED",
    `Voucher ${voucher.code} was applied to order ${order.orderNumber} (${appliedAmount.toFixed(2)} credited).`,
    `/orders/${order.id}`
  );

  redirect(`/orders/${order.id}`);
}
