"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { resolveSoaPeriod, findCustomersWithOutstandingBalance, type SoaPeriodSelection } from "@/lib/soa";
import { createStatementAndNotify } from "@/lib/soa-generate";
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

  const statement = await createStatementAndNotify(customerId, range, user.id);
  redirect(`/soa/view/${statement.id}`);
}

/** Monthly SOA management's "Generate All" — one statement per customer currently carrying an outstanding balance for the selected month. Never sent automatically; Admin still has to click Send/Share per statement (or from each statement's own page) afterward. */
export async function generateAllStatementsForMonthAction(month: number, year: number) {
  const user = await requirePermission("SOA_GENERATE");
  const range = resolveSoaPeriod({ type: "monthly", month, year });
  const customers = await findCustomersWithOutstandingBalance(range.end);

  let created = 0;
  for (const c of customers) {
    await createStatementAndNotify(c.customer.id, range, user.id);
    created += 1;
  }

  revalidatePath("/soa/monthly");
  return { created };
}

/** Single-customer "Generate SOA" from the Monthly SOA table — same monthly period math as Generate All, just for one row. */
export async function generateStatementForCustomerAndMonthAction(customerId: string, month: number, year: number) {
  const user = await requirePermission("SOA_GENERATE");
  const range = resolveSoaPeriod({ type: "monthly", month, year });
  const statement = await createStatementAndNotify(customerId, range, user.id);
  revalidatePath("/soa/monthly");
  return { statementId: statement.id };
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

const scheduleSchema = z.object({
  dayOfMonth: z.coerce.number().min(1).max(28),
  onlyIfOutstanding: z.coerce.boolean(),
});

/** Creates (or updates, if one already exists) the customer's recurring SOA schedule — always saved disabled first; Admin enables it as a separate explicit step (toggleStatementScheduleAction), matching the spec's "configurable and explicitly enabled by Admin." */
export async function saveStatementScheduleAction(customerId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("SOA_GENERATE");

  const parsed = scheduleSchema.safeParse({
    dayOfMonth: formData.get("dayOfMonth"),
    onlyIfOutstanding: formData.get("onlyIfOutstanding") === "on",
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const existing = await prisma.statementSchedule.findFirst({ where: { customerId } });
  if (existing) {
    await prisma.statementSchedule.update({
      where: { id: existing.id },
      data: { dayOfMonth: parsed.data.dayOfMonth, onlyIfOutstanding: parsed.data.onlyIfOutstanding },
    });
  } else {
    await prisma.statementSchedule.create({
      data: {
        customerId,
        dayOfMonth: parsed.data.dayOfMonth,
        onlyIfOutstanding: parsed.data.onlyIfOutstanding,
        createdById: user.id,
        enabled: false,
      },
    });
  }

  await logAudit(user.id, "SOA_SCHEDULE_SAVED", "Customer", customerId, {});
  revalidatePath(`/soa/customer/${customerId}`);
}

export async function toggleStatementScheduleAction(scheduleId: string, enabled: boolean) {
  const user = await requirePermission("SOA_GENERATE");
  const schedule = await prisma.statementSchedule.update({ where: { id: scheduleId }, data: { enabled } });
  await logAudit(user.id, "SOA_SCHEDULE_TOGGLED", "Customer", schedule.customerId, { enabled });
  revalidatePath(`/soa/customer/${schedule.customerId}`);
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
