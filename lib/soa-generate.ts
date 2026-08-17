import { prisma } from "@/lib/prisma";
import { nextStatementNumber } from "@/lib/numbering";
import { computeStatementOfAccount } from "@/lib/soa";
import { notifyCustomer } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { formatCurrency } from "@/lib/utils";

/**
 * The one place a StatementOfAccount row gets created — used by the
 * interactive "Generate SOA" action, the Monthly SOA dashboard's per-
 * customer and "Generate All" actions, and the recurring schedule sweep,
 * so numbering/notification/audit behavior can never drift between them.
 */
export async function createStatementAndNotify(
  customerId: string,
  range: { start: Date; end: Date },
  generatedById: string,
  notificationType: "SOA_GENERATED" | "SOA_PAYMENT_REMINDER" = "SOA_GENERATED"
) {
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
      generatedById,
    },
  });

  await logAudit(generatedById, "SOA_GENERATED", "StatementOfAccount", statement.id, {
    customerId,
    outstandingBalance: computation.outstandingBalance,
  });

  const message =
    notificationType === "SOA_PAYMENT_REMINDER"
      ? `Your account has an outstanding balance of ${formatCurrency(computation.outstandingBalance)}. See your Statement of Account ${statementNumber}.`
      : `Your Statement of Account ${statementNumber} is ready. Outstanding balance: ${formatCurrency(computation.outstandingBalance)}.`;

  await notifyCustomer(customerId, notificationType, message, `/soa/view/${statement.id}`);

  return statement;
}
