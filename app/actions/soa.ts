"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { nextStatementNumber } from "@/lib/numbering";
import { computeStatementOfAccount, resolveSoaPeriod, type SoaPeriodSelection } from "@/lib/soa";
import { notifyCustomer } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { formatCurrency } from "@/lib/utils";

const periodSchema = z.union([
  z.object({ type: z.literal("monthly"), month: z.coerce.number().min(1).max(12), year: z.coerce.number() }),
  z.object({ type: z.literal("custom"), startDate: z.string().min(1), endDate: z.string().min(1) }),
]);

export async function generateStatementAction(customerId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SOA_GENERATE");

  const type = formData.get("periodType") === "custom" ? "custom" : "monthly";
  const parsed = periodSchema.safeParse(
    type === "custom"
      ? { type: "custom", startDate: formData.get("startDate"), endDate: formData.get("endDate") }
      : { type: "monthly", month: formData.get("month"), year: formData.get("year") }
  );
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid period.";

  const range = resolveSoaPeriod(parsed.data as SoaPeriodSelection);
  if (range.end <= range.start) return "The statement period end must be after its start.";

  const computation = await computeStatementOfAccount(customerId, range.start, range.end);
  const statementNumber = await nextStatementNumber(range.end);

  const statement = await prisma.statementOfAccount.create({
    data: {
      statementNumber,
      customerId,
      periodStart: range.start,
      periodEnd: range.end,
      openingBalance: computation.openingBalance,
      totalCharges: computation.totalCharges,
      totalPayments: computation.totalPayments,
      adjustments: computation.adjustments,
      outstandingBalance: computation.outstandingBalance,
      generatedById: user.id,
    },
  });

  await logAudit(user.id, "SOA_GENERATED", "StatementOfAccount", statement.id, {
    customerId,
    outstandingBalance: computation.outstandingBalance,
  });

  await notifyCustomer(
    customerId,
    "SOA_GENERATED",
    `Your Statement of Account ${statementNumber} is ready. Outstanding balance: ${formatCurrency(computation.outstandingBalance)}.`,
    `/soa/view/${statement.id}`
  );

  redirect(`/soa/view/${statement.id}`);
}

const adjustmentSchema = z.object({
  type: z.enum(["CHARGE", "CREDIT"]),
  amount: z.coerce.number().positive("Enter an amount greater than zero."),
  description: z.string().min(3, "Describe this adjustment."),
  orderId: z.string().optional(),
});

export async function addAccountAdjustmentAction(customerId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SOA_GENERATE");

  const parsed = adjustmentSchema.safeParse({
    type: formData.get("type"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    orderId: formData.get("orderId") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  await prisma.accountAdjustment.create({
    data: {
      customerId,
      orderId: parsed.data.orderId || undefined,
      type: parsed.data.type,
      amount: parsed.data.amount,
      description: parsed.data.description,
      createdById: user.id,
    },
  });

  await logAudit(user.id, "ACCOUNT_ADJUSTMENT_CREATED", "Customer", customerId, {
    type: parsed.data.type,
    amount: parsed.data.amount,
  });

  revalidatePath(`/soa/customer/${customerId}`);
}

/** "Send/Share" from the Monthly SOA workflow or a statement's own page — generates the statement (if not already) and emails it immediately, distinct from just creating a shareable link. */
export async function sendStatementEmailAction(statementId: string) {
  const user = await requirePermission("SOA_SHARE");
  const statement = await prisma.statementOfAccount.findUniqueOrThrow({ where: { id: statementId } });

  await notifyCustomer(
    statement.customerId,
    "SOA_SHARED",
    `Your Statement of Account ${statement.statementNumber} has been sent. Outstanding balance: ${formatCurrency(Number(statement.outstandingBalance))}.`,
    `/soa/view/${statement.id}`
  );

  await logAudit(user.id, "SOA_EMAILED", "StatementOfAccount", statementId, {});
  revalidatePath(`/soa/view/${statementId}`);
}

/** Prefills the floating Chatbox with a link to this statement in the customer's own conversation — reuses the existing Chatbox rather than a separate send mechanism. */
export async function getStatementChatContextAction(statementId: string) {
  await requirePermission("SOA_SHARE");
  const statement = await prisma.statementOfAccount.findUniqueOrThrow({
    where: { id: statementId },
    include: { customer: true },
  });
  return {
    customerId: statement.customerId,
    customerName: statement.customer.name,
    statementNumber: statement.statementNumber,
  };
}
