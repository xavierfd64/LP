"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { resolveSoaPeriod, findCustomersWithOutstandingBalance, computeStatementOfAccount, type SoaPeriodSelection } from "@/lib/soa";
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

export type SoaLedgerPreview = {
  totalCharges: number;
  totalPayments: number;
  outstandingBalance: number;
  rows: {
    date: string;
    type: "ORDER" | "PAYMENT" | "ADJUSTMENT";
    reference: string;
    description: string;
    charge: number;
    payment: number;
    runningBalance: number;
    isHistorical: boolean;
  }[];
};

/**
 * SOA dashboard's "Preview on Screen" / "Customer Transaction History"
 * Quick Actions (SOA UI/UX improvement, Sept 3) — a read-only, on-demand
 * look at an arbitrary date range WITHOUT persisting a StatementOfAccount
 * row, so previewing never spams the Previous Statements list. Calls the
 * exact same computeStatementOfAccount() every other SOA number already
 * comes from — no separate/parallel calculation.
 */
export async function previewStatementOfAccountAction(
  customerId: string,
  periodStartIso: string,
  periodEndIso: string
): Promise<SoaLedgerPreview> {
  await requirePermission("SOA_VIEW");
  const computation = await computeStatementOfAccount(customerId, new Date(periodStartIso), new Date(periodEndIso));
  return {
    totalCharges: computation.totalCharges,
    totalPayments: computation.totalPayments,
    outstandingBalance: computation.outstandingBalance,
    rows: computation.rows.map((r) => ({
      date: r.date.toISOString(),
      type: r.type,
      reference: r.reference,
      description: r.description,
      charge: r.charge,
      payment: r.payment,
      runningBalance: r.runningBalance,
      isHistorical: r.isHistorical,
    })),
  };
}

/**
 * SOA dashboard's "View / Print SOA", "Save as PDF", and "Send SOA to
 * Customer" Quick Actions (Sept 3) — same generation path as
 * generateStatementAction/generateStatementForCustomerAndMonthAction
 * (createStatementAndNotify, so numbering/notification/audit never
 * drift), just for an arbitrary [start, end) range instead of a
 * monthly/custom-form period, and returning rather than redirecting so
 * the caller can chain a Send or open a specific document route.
 */
export async function generateStatementForRangeAction(customerId: string, periodStartIso: string, periodEndIso: string) {
  const user = await requirePermission("SOA_GENERATE");
  const start = new Date(periodStartIso);
  const end = new Date(periodEndIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error("The statement period end must be after its start.");
  }
  const statement = await createStatementAndNotify(customerId, { start, end }, user.id);
  revalidatePath(`/soa/customer/${customerId}`);
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

/**
 * "Send/Share" from the Monthly SOA workflow, a statement's own page, or
 * the SOA dashboard's "Send SOA to Customer" Quick Action — emails the
 * statement immediately, distinct from just creating a shareable link.
 * `note` is optional (existing callers keep sending the plain default
 * message) — the SOA dashboard's Send modal is the only caller that
 * passes one, appended to the same notifyCustomer message every other
 * SOA notification already goes through (no separate send channel).
 */
export async function sendStatementEmailAction(statementId: string, note?: string) {
  const user = await requirePermission("SOA_SHARE");
  const statement = await prisma.statementOfAccount.findUniqueOrThrow({ where: { id: statementId } });

  const baseMessage = `Your Statement of Account ${statement.statementNumber} has been sent. Outstanding balance: ${formatCurrency(Number(statement.outstandingBalance))}.`;
  await notifyCustomer(
    statement.customerId,
    "SOA_SHARED",
    note ? `${baseMessage} Note: ${note}` : baseMessage,
    `/soa/view/${statement.id}`
  );

  await logAudit(user.id, "SOA_EMAILED", "StatementOfAccount", statementId, note ? { note } : {});
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
