"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/utils";
import { PAYMENT_FILTER_PERIODS } from "@/lib/payment-filter-periods";
import { getInquiriesForExport, type InquiryExportRow } from "@/lib/inquiries-list";
import { buildListExportFile } from "@/lib/list-export-writer";
import type { ListExportInput } from "@/components/lists/list-export-dialog";
import { INQUIRY_EXPORT_COLUMNS, type InquiryExportColumnKey } from "@/lib/inquiry-export-columns";

/** Inquiry-specific export (Aug 22 UI redesign update 2, Part 9) — gated behind INQUIRY_VIEW, the same permission the Inquiries dashboard itself requires. Mirrors app/actions/payments-export.ts's shape. */

const exportSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["NEW", "QUOTED", "CLOSED", "CANCELLED"]).optional(),
  period: z.enum(PAYMENT_FILTER_PERIODS).optional(),
  what: z.enum(["all", "columns", "summary"]),
  columns: z.array(z.string()).optional(),
  format: z.enum(["xlsx", "csv"]),
  includeHeaders: z.boolean(),
  includeTotals: z.boolean(),
});

function resolveCell(key: InquiryExportColumnKey, r: InquiryExportRow): string | number {
  switch (key) {
    case "customerName":
      return r.customer.name;
    case "customerPhone":
      return r.customer.contactNumber ?? "";
    case "customerEmail":
      return r.customer.email ?? "";
    case "product":
      return r.desiredProduct;
    case "quantity":
      return r.roughQty ?? "";
    case "status":
      return r.status;
    case "submittedAt":
      return formatDate(r.createdAt) ?? "";
  }
}

export async function exportInquiriesAction(input: ListExportInput) {
  const user = await requirePermission("INQUIRY_VIEW");
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid export request." };
  const { q, status, period, what, columns, format, includeHeaders } = parsed.data;
  const filters = { q, status, period };

  let table: (string | number)[][] = [];
  let filenamePart = "inquiries";
  let rowCount = 0;

  if (what === "summary") {
    filenamePart = "inquiries-summary";
    const { inquiries } = await getInquiriesForExport(filters);
    const counts = new Map<string, number>();
    for (const i of inquiries) counts.set(i.status, (counts.get(i.status) ?? 0) + 1);
    rowCount = counts.size;
    const header = ["Status", "Count"];
    const rows = Array.from(counts.entries()).map(([status, count]) => [status, count]);
    table = includeHeaders ? [header, ...rows] : rows;
  } else {
    filenamePart = what === "columns" ? "inquiries-selected" : "inquiries";
    const cols =
      what === "columns" && columns && columns.length > 0
        ? INQUIRY_EXPORT_COLUMNS.filter((c) => columns.includes(c.key))
        : INQUIRY_EXPORT_COLUMNS;
    const { inquiries, total, truncated } = await getInquiriesForExport(filters);
    rowCount = inquiries.length;
    const header = cols.map((c) => c.label);
    const dataRows = inquiries.map((r) => cols.map((c) => resolveCell(c.key, r)));
    if (truncated) {
      dataRows.push(cols.map((_, i) => (i === 0 ? `Export capped at ${inquiries.length} of ${total} matching rows — refine filters for a complete export.` : "")));
    }
    table = includeHeaders ? [header, ...dataRows] : dataRows;
  }

  const { bytes, mimeType, filename } = buildListExportFile("Inquiries", table, format, filenamePart);

  await logAudit(user.id, "INQUIRIES_EXPORTED", "Inquiry", "export", { format, what, filters: { q: q || undefined, status, period }, rowCount });

  return { ok: true as const, filename, mimeType, base64: bytes.toString("base64") };
}
