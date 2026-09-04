import { prisma } from "@/lib/prisma";
import type { ShareDocType } from "@/lib/document-sharing";
import { computeStatementOfAccount, deriveSoaBalanceStatus } from "@/lib/soa";

export type PublicDocumentResult =
  | { ok: false; reason: "not_found" | "revoked" | "expired" }
  | {
      ok: true;
      docType: ShareDocType;
      accessLevel: "VIEW_ONLY" | "VIEW_DOWNLOAD";
      quotation?: NonNullable<Awaited<ReturnType<typeof loadQuotation>>>;
      invoice?: NonNullable<Awaited<ReturnType<typeof loadInvoice>>>;
      jobOrder?: NonNullable<Awaited<ReturnType<typeof loadJobOrder>>>;
      statement?: NonNullable<Awaited<ReturnType<typeof loadStatement>>>;
    };

function loadQuotation(id: string) {
  return prisma.quotation.findUnique({
    where: { id },
    include: { customer: true, lineItems: true, createdBy: true },
  });
}

function loadInvoice(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      quotation: { include: { lineItems: true } },
      lineItems: true,
      payments: { where: { status: "CONFIRMED" } },
    },
  });
}

function loadJobOrder(id: string) {
  return prisma.jobOrder.findUnique({
    where: { id },
    include: {
      order: { include: { customer: true, quotation: true } },
      stageLogs: { orderBy: { stageOrder: "asc" }, include: { assignedTo: true } },
    },
  });
}

async function loadStatement(id: string) {
  const statement = await prisma.statementOfAccount.findUnique({ where: { id }, include: { customer: true } });
  if (!statement) return null;
  const [computation, openOrders] = await Promise.all([
    computeStatementOfAccount(statement.customerId, statement.periodStart, statement.periodEnd),
    prisma.order.findMany({ where: { customerId: statement.customerId, status: { not: "CANCELLED" } }, select: { dueDate: true } }),
  ]);
  return { statement, computation, balanceStatus: deriveSoaBalanceStatus(openOrders) };
}

/**
 * Token-authorized, read-only document lookup for the public sharing page —
 * the mirror of getPublicOrderTrackingAction but for a single Quotation/
 * Invoice/Job Order/Statement of Account document instead of an order's
 * progress. Records the view (view count + timestamp) as a side effect of
 * a successful lookup.
 */
export async function resolvePublicDocument(token: string): Promise<PublicDocumentResult> {
  const link = await prisma.documentShareLink.findUnique({ where: { token } });
  if (!link) return { ok: false, reason: "not_found" };
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  const docType: ShareDocType = link.quotationId
    ? "QUOTATION"
    : link.orderId
      ? "INVOICE"
      : link.statementId
        ? "SOA"
        : "JOB_ORDER";
  const docId = link.quotationId ?? link.orderId ?? link.statementId ?? link.jobOrderId!;

  await prisma.documentShareLink.update({
    where: { id: link.id },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });

  if (docType === "QUOTATION") {
    const quotation = await loadQuotation(docId);
    if (!quotation) return { ok: false, reason: "not_found" };
    return { ok: true, docType, accessLevel: link.accessLevel, quotation };
  }
  if (docType === "INVOICE") {
    const invoice = await loadInvoice(docId);
    if (!invoice) return { ok: false, reason: "not_found" };
    return { ok: true, docType, accessLevel: link.accessLevel, invoice };
  }
  if (docType === "SOA") {
    const statement = await loadStatement(docId);
    if (!statement) return { ok: false, reason: "not_found" };
    return { ok: true, docType, accessLevel: link.accessLevel, statement };
  }
  const jobOrder = await loadJobOrder(docId);
  if (!jobOrder) return { ok: false, reason: "not_found" };
  return { ok: true, docType, accessLevel: link.accessLevel, jobOrder };
}
