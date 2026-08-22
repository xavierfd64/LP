/** Column catalogue for the Orders export (Aug 22 UI redesign update 2) — see lib/inquiry-export-columns.ts's doc comment for why this lives outside the "use server" action file. */
export const ORDER_EXPORT_COLUMNS = [
  { key: "orderNumber", label: "Order Number" },
  { key: "customerName", label: "Customer Name" },
  { key: "customerPhone", label: "Customer Phone" },
  { key: "customerEmail", label: "Customer Email" },
  { key: "jobOrders", label: "Job Orders" },
  { key: "total", label: "Total" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Created" },
] as const;
export type OrderExportColumnKey = (typeof ORDER_EXPORT_COLUMNS)[number]["key"];
export const DEFAULT_ORDER_EXPORT_COLUMNS: OrderExportColumnKey[] = ORDER_EXPORT_COLUMNS.map((c) => c.key);
