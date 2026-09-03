"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/utils";
import { PAYMENT_FILTER_PERIODS } from "@/lib/payment-filter-periods";
import { getOrdersForExport, type OrderExportRow } from "@/lib/orders-list";
import { buildListExportFile } from "@/lib/list-export-writer";
import type { ListExportInput } from "@/components/lists/list-export-dialog";
import { ORDER_EXPORT_COLUMNS, type OrderExportColumnKey } from "@/lib/order-export-columns";

/** Order-specific export (Aug 22 UI redesign update 2, Part 9) — gated behind ORDER_VIEW, the same permission the Orders dashboard itself requires. */

const exportSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["OPEN", "IN_PRODUCTION", "FULFILLING", "COMPLETED", "CANCELLED"]).optional(),
  period: z.enum(PAYMENT_FILTER_PERIODS).optional(),
  what: z.enum(["all", "columns", "summary"]),
  columns: z.array(z.string()).optional(),
  format: z.enum(["xlsx", "csv"]),
  includeHeaders: z.boolean(),
  includeTotals: z.boolean(),
});

function resolveCell(key: OrderExportColumnKey, r: OrderExportRow): string | number {
  switch (key) {
    case "orderNumber":
      return r.orderNumber;
    case "customerName":
      return r.customer.name;
    case "customerPhone":
      return r.customer.contactNumber ?? "";
    case "customerEmail":
      return r.customer.email ?? "";
    case "jobOrders":
      return r.jobOrders.length;
    case "total":
      return Math.round(Number(r.totalAmount) * 100) / 100;
    case "status":
      return r.status;
    case "orderDate":
      return formatDate(r.orderDate) ?? "";
  }
}

export async function exportOrdersAction(input: ListExportInput) {
  const user = await requirePermission("ORDER_VIEW");
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid export request." };
  const { q, status, period, what, columns, format, includeHeaders, includeTotals } = parsed.data;
  const filters = { q, status, period };

  let table: (string | number)[][] = [];
  let filenamePart = "orders";
  let rowCount = 0;

  if (what === "summary") {
    filenamePart = "orders-summary";
    const { orders } = await getOrdersForExport(filters);
    const counts = new Map<string, { count: number; total: number }>();
    for (const o of orders) {
      const entry = counts.get(o.status) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += Number(o.totalAmount);
      counts.set(o.status, entry);
    }
    rowCount = counts.size;
    const header = ["Status", "Count", "Total"];
    const rows = Array.from(counts.entries()).map(([status, v]) => [status, v.count, Math.round(v.total * 100) / 100]);
    table = includeHeaders ? [header, ...rows] : rows;
  } else {
    filenamePart = what === "columns" ? "orders-selected" : "orders";
    const cols =
      what === "columns" && columns && columns.length > 0
        ? ORDER_EXPORT_COLUMNS.filter((c) => columns.includes(c.key))
        : ORDER_EXPORT_COLUMNS;
    const { orders, total, truncated } = await getOrdersForExport(filters);
    rowCount = orders.length;
    const header = cols.map((c) => c.label);
    const dataRows = orders.map((r) => cols.map((c) => resolveCell(c.key, r)));

    if (includeTotals) {
      const amountIdx = cols.findIndex((c) => c.key === "total");
      if (amountIdx >= 0) {
        const sum = orders.reduce((acc, r) => acc + Number(r.totalAmount), 0);
        dataRows.push(cols.map((c, i) => (i === amountIdx ? Math.round(sum * 100) / 100 : i === 0 ? "TOTAL" : "")));
      }
    }
    if (truncated) {
      dataRows.push(cols.map((_, i) => (i === 0 ? `Export capped at ${orders.length} of ${total} matching rows — refine filters for a complete export.` : "")));
    }
    table = includeHeaders ? [header, ...dataRows] : dataRows;
  }

  const { bytes, mimeType, filename } = buildListExportFile("Orders", table, format, filenamePart);

  await logAudit(user.id, "ORDERS_EXPORTED", "Order", "export", { format, what, filters: { q: q || undefined, status, period }, rowCount });

  return { ok: true as const, filename, mimeType, base64: bytes.toString("base64") };
}
