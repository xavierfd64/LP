/**
 * Canonical Messenger event registry — client-safe (no server-only
 * imports) so the Messenger Settings UI can import it directly, same role
 * as lib/email-events.ts. Keys reuse the exact `type` strings already
 * passed to notifyCustomer throughout app/actions/**, so no module needs
 * Messenger-specific code. Unlike email's per-event granularity, the spec
 * asks for four broad category toggles (Production/Payment/Delivery/SOA
 * reminder) — any notifyCustomer type not mapped to one of these four
 * simply never goes out over Messenger (mirrors email's NON_EMAIL_TYPES).
 */
export type MessengerCategory = "PRODUCTION" | "PAYMENT" | "DELIVERY" | "SOA_REMINDER";

export const MESSENGER_CATEGORIES: { key: MessengerCategory; label: string }[] = [
  { key: "PRODUCTION", label: "Production Updates" },
  { key: "PAYMENT", label: "Payment & Order Updates" },
  { key: "DELIVERY", label: "Delivery Updates" },
  { key: "SOA_REMINDER", label: "Statement of Account / Payment Reminders" },
];

export const MESSENGER_EVENTS: Record<string, { category: MessengerCategory; label: string }> = {
  QUOTATION_SENT: { category: "PAYMENT", label: "Quotation Sent" },
  QUOTATION_APPROVED: { category: "PAYMENT", label: "Quotation Approved" },
  QUOTATION_FORCE_APPROVED: { category: "PAYMENT", label: "Quotation Approved" },
  ORDER_CREATED: { category: "PAYMENT", label: "Order Created" },
  PAYMENT_CONFIRMED: { category: "PAYMENT", label: "Payment Confirmed" },
  BALANCE_REMINDER: { category: "PAYMENT", label: "Payment Reminder" },
  JOB_ORDER_CREATED: { category: "PRODUCTION", label: "Job Order Created" },
  JOB_ORDER_COMPLETED: { category: "PRODUCTION", label: "Job Order Completed" },
  PRODUCTION_STARTED: { category: "PRODUCTION", label: "Production Started" },
  PRODUCTION_STAGE_UPDATE: { category: "PRODUCTION", label: "Production Update" },
  FULFILLMENT_CREATED: { category: "DELIVERY", label: "Delivery/Pickup Scheduled" },
  FULFILLMENT_IN_TRANSIT: { category: "DELIVERY", label: "In Transit" },
  FULFILLMENT_DELIVERED: { category: "DELIVERY", label: "Delivered" },
  FULFILLMENT_INSTALLED: { category: "DELIVERY", label: "Installed" },
  FULFILLMENT_RECEIVED: { category: "DELIVERY", label: "Received" },
  ORDER_COMPLETED: { category: "DELIVERY", label: "Order Completed" },
  SOA_GENERATED: { category: "SOA_REMINDER", label: "Statement of Account Generated" },
  SOA_PAYMENT_REMINDER: { category: "SOA_REMINDER", label: "SOA Payment Reminder" },
  FORM_LINK_SENT: { category: "PRODUCTION", label: "Customer Form Link Sent" },
  FORM_REOPENED: { category: "PRODUCTION", label: "Customer Form Reopened" },
  FORM_ITEM_ADDED: { category: "PRODUCTION", label: "Customer Form Items Added" },
  // Sent from the Production Kanban's Messenger Dispatch dialog, not the
  // automatic per-event funnel above — label-only entry (never checked
  // against messengerEventSettings) so it displays cleanly in the log.
  MANUAL_DISPATCH: { category: "PRODUCTION", label: "Manual Kanban Update" },
};

/** Kept deliberately short — Messenger is a quick heads-up, not the full document (spec: "kept concise with example message formats including a [Track Your Order] link"). */
export function messengerMessageFor(type: string, vars: { message: string; trackingLink?: string }): string {
  const label = MESSENGER_EVENTS[type]?.label ?? type;
  const lines = [`${label}: ${vars.message}`];
  if (vars.trackingLink) lines.push("", `[ Track Your Order ] ${vars.trackingLink}`);
  return lines.join("\n");
}
