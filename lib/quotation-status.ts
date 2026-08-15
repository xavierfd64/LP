// Quotation statuses that represent a still-live quotation for a given
// inquiry — anything here blocks creating a second, competing quotation.
// CANCELLED and REJECTED are terminal/dead and don't block a fresh one.
export const ACTIVE_QUOTATION_STATUSES = ["DRAFT", "SENT", "REVISION_REQUESTED", "APPROVED"] as const;

export function isActiveQuotationStatus(status: string): boolean {
  return (ACTIVE_QUOTATION_STATUSES as readonly string[]).includes(status);
}
