"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/utils";
import { PAYMENT_FILTER_PERIODS } from "@/lib/payment-filter-periods";
import { getQuotationsForExport, type QuotationExportRow } from "@/lib/quotations-list";
import { buildListExportFile } from "@/lib/list-export-writer";
import type { ListExportInput } from "@/components/lists/list-export-dialog";
import { QUOTATION_EXPORT_COLUMNS, type QuotationExportColumnKey } from "@/lib/quotation-export-columns";

/** Quotation-specific export (Aug 22 UI redesign update 2, Part 9) — gated behind QUOTATION_VIEW, the same permission the Quotations dashboard itself requires. */

const exportSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["DRAFT", "SENT", "APPROVED", "REJECTED", "REVISION_REQUESTED", "CANCELLED"]).optional(),
  period: z.enum(PAYMENT_FILTER_PERIODS).optional(),
  what: z.enum(["all", "columns", "summary"]),
  columns: z.array(z.string()).optional(),
  format: z.enum(["xlsx", "csv"]),
  includeHeaders: z.boolean(),
  includeTotals: z.boolean(),
});

function resolveCell(key: QuotationExportColumnKey, r: QuotationExportRow): string | number {
  switch (key) {
    case "quoteNumber":
      return r.quoteNumber;
    case "customerName":
      return r.customer.name;
    case "customerPhone":
      return r.customer.contactNumber ?? "";
    case "customerEmail":
      return r.customer.email ?? "";
    case "total":
      return Math.round(Number(r.total) * 100) / 100;
    case "status":
      return r.status;
    case "createdAt":
      return formatDate(r.createdAt) ?? "";
  }
}

export async function exportQuotationsAction(input: ListExportInput) {
  const user = await requirePermission("QUOTATION_VIEW");
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid export request." };
  const { q, status, period, what, columns, format, includeHeaders, includeTotals } = parsed.data;
  const filters = { q, status, period };

  let table: (string | number)[][] = [];
  let filenamePart = "quotations";
  let rowCount = 0;

  if (what === "summary") {
    filenamePart = "quotations-summary";
    const { quotations } = await getQuotationsForExport(filters);
    const counts = new Map<string, { count: number; total: number }>();
    for (const q2 of quotations) {
      const entry = counts.get(q2.status) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += Number(q2.total);
      counts.set(q2.status, entry);
    }
    rowCount = counts.size;
    const header = ["Status", "Count", "Total"];
    const rows = Array.from(counts.entries()).map(([status, v]) => [status, v.count, Math.round(v.total * 100) / 100]);
    table = includeHeaders ? [header, ...rows] : rows;
  } else {
    filenamePart = what === "columns" ? "quotations-selected" : "quotations";
    const cols =
      what === "columns" && columns && columns.length > 0
        ? QUOTATION_EXPORT_COLUMNS.filter((c) => columns.includes(c.key))
        : QUOTATION_EXPORT_COLUMNS;
    const { quotations, total, truncated } = await getQuotationsForExport(filters);
    rowCount = quotations.length;
    const header = cols.map((c) => c.label);
    const dataRows = quotations.map((r) => cols.map((c) => resolveCell(c.key, r)));

    if (includeTotals) {
      const amountIdx = cols.findIndex((c) => c.key === "total");
      if (amountIdx >= 0) {
        const sum = quotations.reduce((acc, r) => acc + Number(r.total), 0);
        dataRows.push(cols.map((c, i) => (i === amountIdx ? Math.round(sum * 100) / 100 : i === 0 ? "TOTAL" : "")));
      }
    }
    if (truncated) {
      dataRows.push(cols.map((_, i) => (i === 0 ? `Export capped at ${quotations.length} of ${total} matching rows — refine filters for a complete export.` : "")));
    }
    table = includeHeaders ? [header, ...dataRows] : dataRows;
  }

  const { bytes, mimeType, filename } = buildListExportFile("Quotations", table, format, filenamePart);

  await logAudit(user.id, "QUOTATIONS_EXPORTED", "Quotation", "export", { format, what, filters: { q: q || undefined, status, period }, rowCount });

  return { ok: true as const, filename, mimeType, base64: bytes.toString("base64") };
}
