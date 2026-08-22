import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { resolvePeriodRange } from "@/lib/transaction-summary";
import type { PaymentFilterPeriod } from "@/lib/payment-filter-periods";

/**
 * Data layer for the staff/admin Inquiries dashboard (Aug 22 UI redesign
 * update 2) — summary cards, search/filter, pagination, and export all
 * read from the one buildInquiryWhere() definition, so none of them can
 * drift from what the table itself shows for a given q/status/period.
 */

export type InquirySearchFilters = { q?: string; status?: "NEW" | "QUOTED" | "CLOSED" | "CANCELLED"; period?: PaymentFilterPeriod };
export type InquiryListFilters = InquirySearchFilters & { page: number; pageSize: number };

export function buildInquiryWhere({ q, status, period }: InquirySearchFilters): Prisma.InquiryWhereInput {
  const where: Prisma.InquiryWhereInput = {};
  if (status) where.status = status;
  if (period && period !== "all") {
    const { start, end } = resolvePeriodRange({ type: period });
    where.createdAt = { gte: start, lt: end };
  }
  if (q && q.trim()) {
    const query = q.trim();
    where.OR = [
      { desiredProduct: { contains: query, mode: "insensitive" } },
      { customer: { name: { contains: query, mode: "insensitive" } } },
      { customer: { contactNumber: { contains: query, mode: "insensitive" } } },
      { customer: { email: { contains: query, mode: "insensitive" } } },
    ];
  }
  return where;
}

export async function getPaginatedInquiries(filters: InquiryListFilters) {
  const { page, pageSize, ...searchFilters } = filters;
  const where = buildInquiryWhere(searchFilters);
  const skip = (page - 1) * pageSize;

  const [inquiries, total] = await Promise.all([
    prisma.inquiry.findMany({ where, include: { customer: true }, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
    prisma.inquiry.count({ where }),
  ]);

  return { inquiries, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Every summary card is scoped to "this month", matching the illustration's subtext on all four cards. */
export async function getInquiriesSummary() {
  const { start, end } = resolvePeriodRange({ type: "monthly" });
  const monthWhere = { createdAt: { gte: start, lt: end } };
  const [total, quoted, fresh, closed] = await Promise.all([
    prisma.inquiry.count({ where: monthWhere }),
    prisma.inquiry.count({ where: { ...monthWhere, status: "QUOTED" } }),
    prisma.inquiry.count({ where: { ...monthWhere, status: "NEW" } }),
    prisma.inquiry.count({ where: { ...monthWhere, status: "CLOSED" } }),
  ]);
  return { total, quoted, new: fresh, closed };
}

export const EXPORT_ROW_CAP = 5000;

export async function getInquiriesForExport(filters: InquirySearchFilters) {
  const where = buildInquiryWhere(filters);
  const [inquiries, total] = await Promise.all([
    prisma.inquiry.findMany({ where, include: { customer: true }, orderBy: { createdAt: "desc" }, take: EXPORT_ROW_CAP }),
    prisma.inquiry.count({ where }),
  ]);
  return { inquiries, total, truncated: total > EXPORT_ROW_CAP };
}

export type InquiryExportRow = Awaited<ReturnType<typeof getInquiriesForExport>>["inquiries"][number];
