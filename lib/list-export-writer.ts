import { buildCsv } from "@/lib/csv-writer";
import { buildXlsxBuffer } from "@/lib/xlsx-writer";

/**
 * Shared CSV/XLSX file-assembly step for the Inquiries/Quotations/Orders
 * export actions (Aug 22 UI redesign update 2) — the same mechanics
 * app/actions/payments-export.ts already has inline, extracted here so
 * three new export actions don't each duplicate the filename/mimetype
 * branching. Payments' own action is left as-is (already shipped).
 */
export function buildListExportFile(sheetName: string, table: (string | number)[][], format: "xlsx" | "csv", filenamePart: string) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    return {
      bytes: buildXlsxBuffer(sheetName, table),
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${filenamePart}-${dateStamp}.xlsx`,
    };
  }
  return {
    bytes: Buffer.from(buildCsv(table), "utf-8"),
    mimeType: "text/csv",
    filename: `${filenamePart}-${dateStamp}.csv`,
  };
}
