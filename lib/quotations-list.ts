import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { resolvePeriodRange } from "@/lib/transaction-summary";
import type { PaymentFilterPeriod } from "@/lib/payment-filter-periods";

/** Data layer for the staff/admin Quotations dashboard (Aug 22 UI redesign update 2) — same one-authoritative-filter pattern as lib/inquiries-list.ts/lib/payments-list.ts. */

export type QuotationSearchFilters = {
  q?: string;
  status?: "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED" | "CANCELLED";
  period?: PaymentFilterPeriod;
};
export type QuotationListFilters = QuotationSearchFilters & { page: number; pageSize: number };

export function buildQuotationWhere({ q, status, period }: QuotationSearchFilters): Prisma.QuotationWhereInput {
  const where: Prisma.QuotationWhereInput = {};
  if (status) where.status = status;
  if (period && period !== "all") {
    const { start, end } = resolvePeriodRange({ type: period });
    where.createdAt = { gte: start, lt: end };
  }
  if (q && q.trim()) {
    const query = q.trim();
    where.OR = [
      { quoteNumber: { contains: query, mode: "insensitive" } },
      { customer: { name: { contains: query, mode: "insensitive" } } },
      { customer: { contactNumber: { contains: query, mode: "insensitive" } } },
      { customer: { email: { contains: query, mode: "insensitive" } } },
      { lineItems: { some: { description: { contains: query, mode: "insensitive" } } } },
    ];
  }
  return where;
}

export async function getPaginatedQuotations(filters: QuotationListFilters) {
  const { page, pageSize, ...searchFilters } = filters;
  const where = buildQuotationWhere(searchFilters);
  const skip = (page - 1) * pageSize;

  const [quotations, total] = await Promise.all([
    prisma.quotation.findMany({ where, include: { customer: true }, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
    prisma.quotation.count({ where }),
  ]);

  return { quotations, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** All four cards scoped to "this month"; "Draft / Rejected" is one combined card, matching the illustration exactly. */
export async function getQuotationsSummary() {
  const { start, end } = resolvePeriodRange({ type: "monthly" });
  const monthWhere = { createdAt: { gte: start, lt: end } };
  const [total, approved, sent, draftOrRejected] = await Promise.all([
    prisma.quotation.count({ where: monthWhere }),
    prisma.quotation.count({ where: { ...monthWhere, status: "APPROVED" } }),
    prisma.quotation.count({ where: { ...monthWhere, status: "SENT" } }),
    prisma.quotation.count({ where: { ...monthWhere, status: { in: ["DRAFT", "REJECTED"] } } }),
  ]);
  return { total, approved, sent, draftOrRejected };
}

export const EXPORT_ROW_CAP = 5000;

export async function getQuotationsForExport(filters: QuotationSearchFilters) {
  const where = buildQuotationWhere(filters);
  const [quotations, total] = await Promise.all([
    prisma.quotation.findMany({ where, include: { customer: true }, orderBy: { createdAt: "desc" }, take: EXPORT_ROW_CAP }),
    prisma.quotation.count({ where }),
  ]);
  return { quotations, total, truncated: total > EXPORT_ROW_CAP };
}

export type QuotationExportRow = Awaited<ReturnType<typeof getQuotationsForExport>>["quotations"][number];
