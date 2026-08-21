/**
 * Shared, dependency-free column catalogue for the Payments export feature
 * (client dialog checkboxes + server export action + print/PDF route all
 * read from this one list — one authoritative definition of "what columns
 * exist", not three). No Prisma import, so the "use client" export dialog
 * can import it directly.
 *
 * There is no separate "invoice number" field in this data model — an
 * Order's `orderNumber` already serves as its invoice number (see
 * app/(print)/orders/[id]/invoice, which prints orderNumber under the
 * label "Invoice Number"). The column below is labeled to make that
 * explicit rather than inventing a second, non-existent identifier.
 */
export type PaymentExportColumnKey =
  | "orderNumber"
  | "quoteNumber"
  | "customerName"
  | "customerPhone"
  | "customerEmail"
  | "amount"
  | "method"
  | "status"
  | "paymentDate"
  | "referenceNumber"
  | "recordedBy"
  | "notes"
  | "proofLink";

export const PAYMENT_EXPORT_COLUMNS: { key: PaymentExportColumnKey; label: string }[] = [
  { key: "orderNumber", label: "Order / Invoice Number" },
  { key: "quoteNumber", label: "Quotation Number" },
  { key: "customerName", label: "Customer Name" },
  { key: "customerPhone", label: "Customer Phone" },
  { key: "customerEmail", label: "Customer Email" },
  { key: "amount", label: "Amount" },
  { key: "method", label: "Payment Method" },
  { key: "status", label: "Status" },
  { key: "paymentDate", label: "Payment Date" },
  { key: "referenceNumber", label: "Reference Number" },
  { key: "recordedBy", label: "Recorded By" },
  { key: "notes", label: "Notes" },
  { key: "proofLink", label: "Payment Proof Link" },
];

// The "All payments" default column set — everything except the proof
// link, which is only ever included when the "Include payment proof
// links" checkbox is explicitly checked (spec item 5), regardless of
// whether "all" or "selected columns" mode is active.
export const DEFAULT_EXPORT_COLUMNS: PaymentExportColumnKey[] = PAYMENT_EXPORT_COLUMNS.filter(
  (c) => c.key !== "proofLink"
).map((c) => c.key);
