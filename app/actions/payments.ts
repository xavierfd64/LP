"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { logAudit } from "@/lib/audit";
import { saveUploadedFile, UploadRejectedError } from "@/lib/upload";
import { assertCanRelease, paymentSummary, RuleViolation } from "@/lib/workflow";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";
import { autoCreateJobOrderForOrder } from "@/lib/quotation-conversion";
import { publishProductionUpdate } from "@/lib/production-realtime";

/**
 * Reuses the exact same payment/business rule this app has always used to
 * decide "can production start" (lib/workflow.ts's paymentSummary) as the
 * trigger for auto-creating an order's first Job Order once a payment
 * clears — never a second, parallel payment-requirement calculation.
 * Self-guarding: a no-op if a Job Order already exists, if the order isn't
 * tied to a quotation with a carry-over-able line item, or if payment
 * still isn't satisfied.
 */
async function autoCreateJobOrderIfPaymentSatisfied(orderId: string, actorId: string) {
  const summary = await paymentSummary(orderId);
  if (summary.hasApprovedTerms || summary.partialMet) {
    await autoCreateJobOrderForOrder(orderId, "Payment Confirmed", actorId);
  }
}

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
  const user = await requirePermission("PAYMENT_RECORD");

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

  // Optional — staff recording a payment they've already verified doesn't
  // require proof the way a customer's self-reported uploadPaymentProofAction
  // does (different action, different status/validation semantics below);
  // this is purely for keeping a record attached, same upload security
  // (allow-list + magic-byte check) as every other upload in the app.
  const proofFile = formData.get("proofFile") as File | null;
  let proofFilePath: string | undefined;
  if (proofFile && proofFile.size > 0) {
    try {
      const saved = await saveUploadedFile(proofFile, "document");
      proofFilePath = saved.path;
    } catch (e) {
      if (e instanceof UploadRejectedError) return e.message;
      throw e;
    }
  }

  const payment = await prisma.payment.create({
    data: {
      orderId,
      amount,
      method,
      referenceNumber,
      paymentDate: paymentDate ? new Date(paymentDate) : undefined,
      notes,
      status: "CONFIRMED",
      proofFilePath,
      recordedById: user.id,
    },
  });

  await logAudit(user.id, "PAYMENT_RECORDED", "Payment", payment.id, {
    orderId,
    amount,
    status: "CONFIRMED",
  });
  await autoCreateJobOrderIfPaymentSatisfied(orderId, user.id);

  // Same "caller says where to land" pattern uploadPaymentProofAction
  // already uses below — RecordPaymentDialog (order detail page) and the
  // Payments page's Record Payment modal both bind this same action but
  // want to land somewhere different afterward.
  const redirectTo = ((formData.get("redirectTo") as string) || "").trim();
  redirect(redirectTo || `/orders/${orderId}`);
}

export async function uploadPaymentProofAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");

  const orderId = String(formData.get("orderId") ?? "");
  const amountRaw = formData.get("amount");
  const methodRaw = formData.get("method");
  const file = formData.get("proofFile") as File | null;
  const referenceNumber = ((formData.get("referenceNumber") as string) || "").trim() || undefined;
  const paymentDateRaw = (formData.get("paymentDate") as string) || undefined;
  const customerNotes = ((formData.get("notes") as string) || "").trim() || undefined;
  // Both the standalone Payment page and the order detail page's inline
  // "Pay via E-Wallet / Bank Transfer" form share this one action — the
  // page that rendered the form says where to land afterward, defaulting
  // to the order it came from (the pre-existing behavior) if unset.
  const redirectTo = ((formData.get("redirectTo") as string) || "").trim();

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

  // Security hardening pass #2 (M4/M5): the server must independently know
  // how much is actually payable — never trust a customer-submitted amount
  // on its own. A claimed amount beyond the real remaining balance is
  // rejected here at submission time; confirmPaymentAction re-derives and
  // re-checks this same balance again at confirmation time (state can move
  // between upload and confirm), so this isn't the only gate — it's the
  // earliest one, so a customer gets immediate feedback instead of a
  // silently-stuck PENDING record.
  const preSummary = await paymentSummary(orderId);
  const balanceDue = preSummary.total - preSummary.confirmed;
  if (balanceDue <= 0.01) return "This order has no remaining balance — no payment is needed.";
  if (amount > balanceDue + 0.01) {
    return `That amount exceeds the remaining balance of ${balanceDue.toFixed(2)}. Please enter an amount up to the balance due.`;
  }

  let saved: { filename: string; path: string };
  try {
    saved = await saveUploadedFile(file, "document");
  } catch (e) {
    if (e instanceof UploadRejectedError) return e.message;
    throw e;
  }

  const payment = await prisma.payment.create({
    data: {
      orderId,
      amount,
      method,
      referenceNumber,
      paymentDate: paymentDateRaw ? new Date(paymentDateRaw) : undefined,
      status: "PENDING",
      proofFilePath: saved.path,
      recordedById: user.id,
      notes: customerNotes ? `${customerNotes} (proof: ${saved.filename})` : `Uploaded by customer: ${saved.filename}`,
    },
  });

  await logAudit(user.id, "PAYMENT_PROOF_UPLOADED", "Payment", payment.id, { orderId, amount, method });
  await notifyStaff("PAYMENT_PROOF_UPLOADED", `Customer uploaded a payment proof for order ${order.orderNumber}.`, `/orders/${orderId}`);

  redirect(redirectTo || `/orders/${orderId}`);
}

export async function confirmPaymentAction(paymentId: string) {
  const user = await requirePermission("PAYMENT_VERIFY");

  // Security hardening pass #2 (M4/M5, M7/M9): this is the actual moment a
  // claimed amount becomes real, counted money — the authoritative
  // server-side check belongs here, not just at upload time, because the
  // order's balance can have moved since the payment was submitted (another
  // payment recorded/confirmed in the meantime). Locks the Order row for
  // the duration of the check + update (same `SELECT ... FOR UPDATE`
  // pattern already used by autoCreateJobOrderForOrder) so two concurrent
  // confirmations against the same order's balance can't both pass the
  // check before either commits — the second one re-reads the
  // now-updated confirmed total.
  let payment;
  try {
    payment = await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${existing.orderId} FOR UPDATE`;

      if (existing.status !== "PENDING") {
        throw new RuleViolation(`This payment is already ${existing.status.toLowerCase()} — nothing to confirm.`);
      }

      const order = await tx.order.findUniqueOrThrow({ where: { id: existing.orderId } });
      const confirmedAgg = await tx.payment.aggregate({
        where: { orderId: existing.orderId, status: "CONFIRMED" },
        _sum: { amount: true },
      });
      const confirmedTotal = Number(confirmedAgg._sum.amount ?? 0);
      const balanceDue = Number(order.totalAmount) - confirmedTotal;
      const amount = Number(existing.amount);
      if (amount > balanceDue + 0.01) {
        throw new RuleViolation(
          `Cannot confirm: this payment's amount (${amount.toFixed(2)}) exceeds the order's remaining balance (${balanceDue.toFixed(2)}). Reject it and ask the customer to resubmit the correct amount, or record the difference separately.`
        );
      }

      return tx.payment.update({
        where: { id: paymentId },
        data: { status: "CONFIRMED" },
        include: { order: true },
      });
    });
  } catch (e) {
    if (e instanceof RuleViolation) {
      redirect(`/payments?error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }

  await logAudit(user.id, "PAYMENT_CONFIRMED", "Payment", paymentId, {
    orderId: payment.orderId,
    amount: Number(payment.amount),
  });
  await notifyCustomer(
    payment.order.customerId,
    "PAYMENT_CONFIRMED",
    `Your payment of ${Number(payment.amount).toFixed(2)} for order ${payment.order.orderNumber} was confirmed.`,
    `/orders/${payment.orderId}`
  );
  await autoCreateJobOrderIfPaymentSatisfied(payment.orderId, user.id);
  redirect(`/payments`);
}

export async function rejectPaymentAction(paymentId: string) {
  const user = await requirePermission("PAYMENT_REJECT");
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

async function grantReleaseException(
  actorId: string,
  input: { orderId: string; releaseExceptionBy: string; releaseExceptionReason: string }
) {
  await prisma.order.update({
    where: { id: input.orderId },
    data: {
      releaseException: true,
      releaseExceptionBy: input.releaseExceptionBy,
      releaseExceptionReason: input.releaseExceptionReason,
    },
  });

  await logAudit(actorId, "RELEASE_EXCEPTION_GRANTED", "Order", input.orderId, {
    releaseExceptionBy: input.releaseExceptionBy,
    releaseExceptionReason: input.releaseExceptionReason,
  });
  await publishProductionUpdate();
}

export async function grantReleaseExceptionAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("ORDER_MODIFY");
  const parsed = releaseExceptionSchema.safeParse({
    orderId: formData.get("orderId"),
    releaseExceptionBy: formData.get("releaseExceptionBy"),
    releaseExceptionReason: formData.get("releaseExceptionReason"),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  await grantReleaseException(user.id, parsed.data);

  redirect(`/orders/${parsed.data.orderId}`);
}

/** Non-redirecting counterpart for the Ready for Fulfillment card's blocked-release popup (1st Update item 3). */
export async function grantReleaseExceptionFromBoardAction(
  orderId: string,
  releaseExceptionBy: string,
  releaseExceptionReason: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requirePermission("ORDER_MODIFY");
  const parsed = releaseExceptionSchema.safeParse({ orderId, releaseExceptionBy, releaseExceptionReason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  await grantReleaseException(user.id, parsed.data);
  return { ok: true };
}

async function releaseJobOrder(jobOrderId: string, actorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const jo = await prisma.jobOrder.findUniqueOrThrow({ where: { id: jobOrderId } });

  if (jo.status !== "READY") {
    return { ok: false, error: "Job order must be READY (passed QC/packing) before release." };
  }

  try {
    await assertCanRelease(jo.orderId);
  } catch (e) {
    if (e instanceof RuleViolation) return { ok: false, error: e.message };
    throw e;
  }

  await prisma.jobOrder.update({ where: { id: jobOrderId }, data: { status: "RELEASED" } });
  await logAudit(actorId, "JOB_ORDER_RELEASED", "JobOrder", jobOrderId, {});
  await publishProductionUpdate();
  return { ok: true };
}

export async function releaseJobOrderAction(jobOrderId: string) {
  const user = await requirePermission("ORDER_MODIFY");
  const result = await releaseJobOrder(jobOrderId, user.id);
  if (!result.ok) redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent(result.error)}`);
  redirect(`/job-orders/${jobOrderId}`);
}

/**
 * Non-redirecting counterpart for the Ready for Fulfillment card's popup
 * (1st Update item 3) — the same release logic as releaseJobOrderAction,
 * just returning a result instead of navigating away, so the popup can
 * show a blocked-state dialog in place (mirroring MoveConfirmDialog) and
 * stay on the Production board on success.
 */
export async function releaseJobOrderFromBoardAction(jobOrderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requirePermission("ORDER_MODIFY");
  return releaseJobOrder(jobOrderId, user.id);
}

const paymentExemptionSchema = z.object({
  orderId: z.string().min(1),
  exemptedBy: z.string().min(1, "Enter who authorized the exemption."),
  reason: z.string().min(1, "Enter a reason."),
});

/**
 * Payment Exemption (1st Update item 4) — lets an authorized staff member
 * waive the required partial payment for a trusted customer (government
 * project, big company, other approved business account) directly from the
 * Quotation View popup, without falsely recording a payment. Reuses the
 * exact same paymentTermType/termsApprovedBy/termsReason mechanism that
 * already exists for Customer.isQualifiedForTerms (lib/quotation-conversion.ts)
 * — this is just a manual, staff-triggered grant of that same "approved
 * terms" state on a case-by-case basis, not a new data-model concept. It
 * never touches Payment records or the order's confirmed/paid totals, so
 * the balance stays a truthful receivable — only production/operational
 * eligibility is unblocked (same as autoCreateJobOrderIfPaymentSatisfied's
 * existing hasApprovedTerms bypass).
 */
async function grantPaymentExemption(
  actorId: string,
  input: { orderId: string; exemptedBy: string; reason: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) return { ok: false, error: "Order not found." };

  const summary = await paymentSummary(input.orderId);
  if (summary.fullyPaid) return { ok: false, error: "This order is already fully paid — no exemption is needed." };

  await prisma.order.update({
    where: { id: input.orderId },
    data: {
      paymentTermType: "APPROVED_TERMS",
      termsApprovedBy: input.exemptedBy,
      termsReason: input.reason,
    },
  });

  await logAudit(actorId, "PAYMENT_EXEMPTION_GRANTED", "Order", input.orderId, {
    exemptedBy: input.exemptedBy,
    reason: input.reason,
  });
  await autoCreateJobOrderIfPaymentSatisfied(input.orderId, actorId);
  await publishProductionUpdate();
  return { ok: true };
}

export async function grantPaymentExemptionAction(
  orderId: string,
  exemptedBy: string,
  reason: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requirePermission("ORDER_MODIFY");
  const parsed = paymentExemptionSchema.safeParse({ orderId, exemptedBy, reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  return grantPaymentExemption(user.id, parsed.data);
}

export async function sendBalanceReminderAction(orderId: string) {
  const user = await requirePermission("PAYMENT_VIEW");
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
  await autoCreateJobOrderIfPaymentSatisfied(order.id, user.id);

  redirect(`/orders/${order.id}`);
}
