/**
 * Column catalogue for the Inquiries export (Aug 22 UI redesign update 2)
 * — kept in a plain module, not the "use server" action file, since
 * Next.js only allows async functions to be exported from a "use server"
 * file (a plain const array isn't a valid server-action export). Mirrors
 * lib/payment-export-columns.ts's role for the Payments export.
 */
export const INQUIRY_EXPORT_COLUMNS = [
  { key: "customerName", label: "Customer Name" },
  { key: "customerPhone", label: "Customer Phone" },
  { key: "customerEmail", label: "Customer Email" },
  { key: "product", label: "Product / Service" },
  { key: "quantity", label: "Quantity" },
  { key: "status", label: "Status" },
  { key: "submittedAt", label: "Submitted" },
] as const;
export type InquiryExportColumnKey = (typeof INQUIRY_EXPORT_COLUMNS)[number]["key"];
export const DEFAULT_INQUIRY_EXPORT_COLUMNS: InquiryExportColumnKey[] = INQUIRY_EXPORT_COLUMNS.map((c) => c.key);
