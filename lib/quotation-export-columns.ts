/** Column catalogue for the Quotations export (Aug 22 UI redesign update 2) — see lib/inquiry-export-columns.ts's doc comment for why this lives outside the "use server" action file. */
export const QUOTATION_EXPORT_COLUMNS = [
  { key: "quoteNumber", label: "Quotation Number" },
  { key: "customerName", label: "Customer Name" },
  { key: "customerPhone", label: "Customer Phone" },
  { key: "customerEmail", label: "Customer Email" },
  { key: "total", label: "Total" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Created" },
] as const;
export type QuotationExportColumnKey = (typeof QUOTATION_EXPORT_COLUMNS)[number]["key"];
export const DEFAULT_QUOTATION_EXPORT_COLUMNS: QuotationExportColumnKey[] = QUOTATION_EXPORT_COLUMNS.map((c) => c.key);
