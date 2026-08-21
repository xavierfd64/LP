"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/utils";
import { PAYMENT_FILTER_PERIODS } from "@/lib/payment-filter-periods";
import {
  getPaymentsForExport,
  getPaymentsExportSummary,
  type PaymentExportRow,
} from "@/lib/payments-list";
import { PAYMENT_EXPORT_COLUMNS, DEFAULT_EXPORT_COLUMNS, type PaymentExportColumnKey } from "@/lib/payment-export-columns";
import { buildCsv } from "@/lib/csv-writer";
import { buildXlsxBuffer } from "@/lib/xlsx-writer";

/**
 * CSV/XLSX export for the staff/admin Payments page (spec: "Add Payment
 * Export"). PDF export is deliberately a separate route
 * (app/(print)/payments/export) rather than generated here — this app's
 * existing "export as PDF" pattern everywhere else (invoices, quotations,
 * job orders, SOAs, the Transaction Summary report) is a print-friendly
 * page the browser prints/saves as PDF, never a server-side PDF library;
 * reusing that pattern avoids introducing a new one just for this feature.
 *
 * Gated behind the exact same permission the Payments page itself requires
 * to be viewed (PAYMENT_VIEW) — an export can never see more than what the
 * viewer's own page already shows them. Never trusts a client-supplied
 * user/customer id or record count: every row comes from a fresh,
 * permission-gated, server-side query built from buildPaymentWhere (via
 * getPaymentsForExport/getPaymentsExportSummary), the same filter
 * definition the paginated table itself uses.
 */

const exportSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["PENDING", "CONFIRMED", "REJECTED"]).optional(),
  period: z.enum(PAYMENT_FILTER_PERIODS).optional(),
  what: z.enum(["all", "columns", "summary"]),
  columns: z.array(z.string()).optional(),
  format: z.enum(["xlsx", "csv"]),
  includeHeaders: z.boolean(),
  includeTotals: z.boolean(),
  includeProofLinks: z.boolean(),
});

export type ExportPaymentsInput = z.infer<typeof exportSchema>;
export type ExportPaymentsResult = { ok: true; filename: string; mimeType: string; base64: string } | { ok: false; error: string };

function resolveCell(key: PaymentExportColumnKey, p: PaymentExportRow): string | number {
  switch (key) {
    case "orderNumber":
      return p.order.orderNumber;
    case "quoteNumber":
      return p.order.quotation?.quoteNumber ?? "";
    case "customerName":
      return p.order.customer.name;
    case "customerPhone":
      return p.order.customer.contactNumber ?? "";
    case "customerEmail":
      return p.order.customer.email ?? "";
    case "amount":
      return Math.round(Number(p.amount) * 100) / 100;
    case "method":
      return p.method.replace(/_/g, " ");
    case "status":
      return p.status;
    case "paymentDate":
      return formatDate(p.paymentDate) ?? "";
    case "referenceNumber":
      return p.referenceNumber ?? "";
    case "recordedBy":
      return p.recordedBy.name;
    case "notes":
      return p.notes ?? "";
    case "proofLink":
      return p.proofFilePath ?? "";
  }
}

function resolveColumns(what: "all" | "columns" | "summary", columns: string[] | undefined, includeProofLinks: boolean) {
  const base =
    what === "columns" && columns && columns.length > 0
      ? PAYMENT_EXPORT_COLUMNS.filter((c) => columns.includes(c.key))
      : PAYMENT_EXPORT_COLUMNS.filter((c) => (DEFAULT_EXPORT_COLUMNS as string[]).includes(c.key));
  // Proof links are only ever included via the explicit checkbox, never
  // just by being in a "selected columns" list — same rule the print route
  // (app/(print)/payments/export) applies.
  return base.filter((c) => c.key !== "proofLink" || includeProofLinks);
}

export async function exportPaymentsAction(input: ExportPaymentsInput): Promise<ExportPaymentsResult> {
  const user = await requirePermission("PAYMENT_VIEW");

  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid export request." };
  const { q, status, period, what, columns, format, includeHeaders, includeTotals, includeProofLinks } = parsed.data;
  const filters = { q, status, period };

  let table: (string | number)[][] = [];
  let filenamePart = "payments";
  let rowCount = 0;

  if (what === "summary") {
    filenamePart = "payments-summary";
    const summary = await getPaymentsExportSummary(filters);
    rowCount = summary.byStatus.length + summary.byMethod.length + 1;
    const header = ["Section", "Label", "Count", "Total Amount"];
    const rows: (string | number)[][] = [
      ["Overall", "All matching payments", summary.overall.count, summary.overall.total],
      ...summary.byStatus.map((s) => ["By Status", s.status, s.count, s.total]),
      ...summary.byMethod.map((m) => ["By Method", m.method.replace(/_/g, " "), m.count, m.total]),
    ];
    table = includeHeaders ? [header, ...rows] : rows;
  } else {
    filenamePart = what === "columns" ? "payments-selected" : "payments";
    const effectiveColumns = resolveColumns(what, columns, includeProofLinks);
    const { payments, total, truncated } = await getPaymentsForExport(filters);
    rowCount = payments.length;

    const header = effectiveColumns.map((c) => c.label);
    const dataRows = payments.map((p) => effectiveColumns.map((c) => resolveCell(c.key, p)));

    if (includeTotals) {
      const amountIdx = effectiveColumns.findIndex((c) => c.key === "amount");
      if (amountIdx >= 0) {
        const sum = payments.reduce((acc, p) => acc + Number(p.amount), 0);
        dataRows.push(effectiveColumns.map((c, i) => (i === amountIdx ? Math.round(sum * 100) / 100 : i === 0 ? "TOTAL" : "")));
      }
    }
    if (truncated) {
      dataRows.push(
        effectiveColumns.map((_, i) =>
          i === 0 ? `Export capped at ${payments.length} of ${total} matching rows — refine filters for a complete export.` : ""
        )
      );
    }

    table = includeHeaders ? [header, ...dataRows] : dataRows;
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  let mimeType: string;
  let bytes: Buffer;
  let ext: string;
  if (format === "xlsx") {
    bytes = buildXlsxBuffer("Payments", table);
    mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    ext = "xlsx";
  } else {
    bytes = Buffer.from(buildCsv(table), "utf-8");
    mimeType = "text/csv";
    ext = "csv";
  }

  await logAudit(user.id, "PAYMENTS_EXPORTED", "Payment", "export", {
    format,
    what,
    filters: { q: q || undefined, status, period },
    rowCount,
  });

  return { ok: true, filename: `${filenamePart}-${dateStamp}.${ext}`, mimeType, base64: bytes.toString("base64") };
}
