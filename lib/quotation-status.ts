// Quotation statuses that represent a still-live quotation for a given
// inquiry — anything here blocks creating a second, competing quotation.
// CANCELLED and REJECTED are terminal/dead and don't block a fresh one.
export const ACTIVE_QUOTATION_STATUSES = ["DRAFT", "SENT", "REVISION_REQUESTED", "APPROVED"] as const;

export function isActiveQuotationStatus(status: string): boolean {
  return (ACTIVE_QUOTATION_STATUSES as readonly string[]).includes(status);
}

// Statuses a quotation can still be in while "awaiting the customer's
// decision" — the set Admin/authorized Staff may approve on the customer's
// behalf from (forceApproveQuotationAction/forceApproveQuotationFromModalAction
// in app/actions/quotations.ts), matching editQuotationAction's own "still
// open" set. A DRAFT quotation is just as much awaiting approval as a SENT
// one — sending is only a notification step, not a business-state gate.
export const FORCE_APPROVABLE_STATUSES = ["DRAFT", "SENT", "REVISION_REQUESTED"] as const;
