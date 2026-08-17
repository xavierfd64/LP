/**
 * Canonical email event registry. Keys deliberately reuse the exact same
 * `type` strings already passed to notifyUser/notifyCustomer/notifyStaff
 * throughout app/actions/** — every existing call site becomes email-
 * capable automatically once lib/notifications.ts checks this map,
 * without touching each module individually (spec's "centralized
 * notification architecture" requirement). A handful of purely-internal
 * types are deliberately left out (see NON_EMAIL_TYPES below) — chat
 * activity and reminders stay bell/Chatbox-only, matching "email is an
 * additional channel," not a channel for absolutely everything.
 *
 * Client-safe (no server-only imports) so Admin's Email Settings UI can
 * import EMAIL_EVENTS directly.
 */
export type EmailEventKey = keyof typeof EMAIL_EVENTS;

export const EMAIL_EVENTS = {
  INQUIRY_CREATED: { label: "Inquiry Submitted", category: "Inquiry" },
  QUOTATION_SENT: { label: "Quotation Sent", category: "Quotation" },
  QUOTATION_APPROVED: { label: "Quotation Approved", category: "Quotation" },
  QUOTATION_REJECTED: { label: "Quotation Rejected", category: "Quotation" },
  QUOTATION_REVISION_REQUESTED: { label: "Modification Requested", category: "Quotation" },
  QUOTATION_CANCELLED: { label: "Quotation Cancelled", category: "Quotation" },
  QUOTATION_FORCE_APPROVED: { label: "Quotation Approved (Staff-assisted)", category: "Quotation" },
  ORDER_CREATED: { label: "Order Created", category: "Orders" },
  ORDER_COMPLETED: { label: "Order Completed", category: "Orders" },
  PAYMENT_PROOF_UPLOADED: { label: "Payment Proof Uploaded", category: "Payments" },
  PAYMENT_CONFIRMED: { label: "Payment Confirmed", category: "Payments" },
  PAYMENT_REJECTED: { label: "Payment Rejected", category: "Payments" },
  BALANCE_REMINDER: { label: "Outstanding Balance Reminder", category: "Payments" },
  JOB_ORDER_COMPLETED: { label: "Job Order Completed", category: "Job Order" },
  PRODUCTION_STAGE_UPDATE: { label: "Production Progress", category: "Production" },
  FULFILLMENT_CREATED: { label: "Delivery/Pickup Scheduled", category: "Fulfillment" },
  FULFILLMENT_IN_TRANSIT: { label: "In Transit", category: "Fulfillment" },
  FULFILLMENT_DELIVERED: { label: "Delivered", category: "Fulfillment" },
  FULFILLMENT_INSTALLED: { label: "Installed", category: "Fulfillment" },
  FULFILLMENT_RECEIVED: { label: "Received", category: "Fulfillment" },
  REWARD_POINTS_EARNED: { label: "Reward Points Earned", category: "Rewards" },
  VOUCHER_REDEEMED: { label: "Voucher Redeemed", category: "Rewards" },
  VOUCHER_USED: { label: "Voucher Used", category: "Rewards" },
  DOCUMENT_SHARED: { label: "Document Shared", category: "Documents" },
  SOA_GENERATED: { label: "Statement of Account Generated", category: "Statement of Account" },
  SOA_SHARED: { label: "Statement of Account Shared", category: "Statement of Account" },
  SOA_PAYMENT_REMINDER: { label: "SOA Payment Reminder", category: "Statement of Account" },
} as const;

/** Notification types that stay bell/Chatbox-only — chat activity and short-lived reminders aren't a good fit for an external email per event. */
export const NON_EMAIL_TYPES = new Set([
  "NEW_MESSAGE",
  "CONVERSATION_ASSIGNED",
  "PRIVATE_CHAT_STARTED",
  "GROUP_CHAT_CREATED",
  "CHAT_RESPONSE_REMINDER",
  "DESIGN_DRAFT_UPLOADED",
]);

export const EMAIL_VARIABLES = [
  "customer_name",
  // Not in the spec's own variable list, but populated for every event
  // wired through the centralized notifyUser/notifyCustomer path (see
  // lib/notifications.ts) with the same human-readable text already shown
  // in the bell notification — the generic default template below leans on
  // it since structured per-event details (amount, specific numbers) aren't
  // available at that generic call site without touching every module.
  "message",
  "quotation_number",
  "invoice_number",
  "job_order_number",
  "order_number",
  "statement_number",
  "amount",
  "balance",
  "due_date",
  "payment_link",
  "tracking_link",
  "document_link",
  "soa_link",
  "business_name",
  "business_phone",
  "business_email",
] as const;

export type EmailVariables = Partial<Record<(typeof EMAIL_VARIABLES)[number], string>>;

/** {{variable}} substitution — unknown/missing variables render as empty string rather than leaking the placeholder. */
export function renderTemplate(text: string, vars: EmailVariables): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key) => vars[key as keyof EmailVariables] ?? "");
}

export function defaultSubjectFor(key: EmailEventKey): string {
  const label = EMAIL_EVENTS[key].label;
  switch (key) {
    case "SOA_GENERATED":
    case "SOA_SHARED":
      return "Your Statement of Account – {{statement_number}}";
    case "SOA_PAYMENT_REMINDER":
      return "Payment Reminder – Outstanding Balance";
    case "BALANCE_REMINDER":
      return "Payment Reminder – {{order_number}}";
    default:
      return `${label} – {{business_name}}`;
  }
}

export function defaultBodyFor(key: EmailEventKey): string {
  switch (key) {
    case "SOA_GENERATED":
    case "SOA_SHARED":
      return [
        "Hello {{customer_name}},",
        "",
        "Please find your Statement of Account ({{statement_number}}).",
        "",
        "Outstanding Balance: {{balance}}",
        "",
        "[ View Statement of Account ]({{soa_link}})",
        "",
        "Thank you,",
        "{{business_name}}",
      ].join("\n");
    case "SOA_PAYMENT_REMINDER":
      return [
        "Dear {{customer_name}},",
        "",
        "This is a friendly reminder that your account currently has an outstanding balance of:",
        "",
        "{{balance}}",
        "",
        "Please review your Statement of Account for complete details.",
        "",
        "[ View Statement of Account ]({{soa_link}})",
        "",
        "Thank you,",
        "{{business_name}}",
      ].join("\n");
    case "DOCUMENT_SHARED":
      return [
        "Hello {{customer_name}},",
        "",
        "A document has been shared with you.",
        "",
        "[ View Document ]({{document_link}})",
        "",
        "Thank you,",
        "{{business_name}}",
      ].join("\n");
    default:
      return [
        "Hello {{customer_name}},",
        "",
        "{{message}}",
        "",
        "{{document_link}}",
        "",
        "Thank you,",
        "{{business_name}}",
      ].join("\n");
  }
}
