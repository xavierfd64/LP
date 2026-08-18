/**
 * Pure message-generation logic for the Production Kanban's Messenger
 * Dispatch dialog — deliberately has no Prisma/DB import so it stays
 * trivially reusable/testable; app/actions/messenger-dispatch.ts fetches the
 * real transaction data and calls this to build the text. Only ever given
 * customer-safe fields by its caller (no internal costs, staff notes, or
 * production comments) — this module has no way to leak what it's never
 * handed.
 */

export type QuickTemplateKey =
  | "PRODUCTION_STARTED"
  | "DESIGN_READY"
  | "PRINTING"
  | "QC"
  | "PACKING"
  | "READY_FOR_PICKUP"
  | "SHIPPED"
  | "DELIVERED";

/** Fixed, optional Staff shortcuts (spec item 13) — distinct from the dynamic default sentence (item 14), which is derived from the Job Order's actual current stage name, not this list. */
export const QUICK_TEMPLATES: { key: QuickTemplateKey; label: string; sentence: string }[] = [
  { key: "PRODUCTION_STARTED", label: "Production Started", sentence: "Your order has entered production." },
  { key: "DESIGN_READY", label: "Design Ready", sentence: "Your design/proof is ready for your review." },
  { key: "PRINTING", label: "Printing", sentence: "Your order is currently in printing." },
  { key: "QC", label: "QC", sentence: "Your order is currently undergoing quality checking." },
  { key: "PACKING", label: "Packing", sentence: "Your order is currently being packed." },
  { key: "READY_FOR_PICKUP", label: "Ready for Pickup", sentence: "Your order is ready for pickup." },
  { key: "SHIPPED", label: "Shipped", sentence: "Your order has been shipped." },
  { key: "DELIVERED", label: "Delivered", sentence: "Your order has been delivered." },
];

/** The auto-suggested body sentence (spec item 14) — always derived from the real current stage name, never one of the fixed QUICK_TEMPLATES above. */
export function defaultStageSentence(currentStage: string): string {
  return `Your order is currently in the ${currentStage} stage.`;
}

export type DispatchMessageInput = {
  businessName: string;
  orderNumber: string;
  joNumber: string;
  customerName: string;
  serviceName: string;
  quantity: number;
  currentStage: string;
  /** 1-based index of the current/most-recently-completed stage. */
  stepIndex: number;
  totalSteps: number;
  trackingUrl: string | null;
  /** Overrides the default stage sentence — set from a QUICK_TEMPLATES pick. */
  bodySentence?: string;
};

/** Builds the full customer-safe update text (spec item 6's example format). Always returned as plain editable text — never locked. */
export function generateDispatchMessage(input: DispatchMessageInput): string {
  const lines: string[] = [
    `${input.businessName.toUpperCase()} — LIVE ORDER UPDATE`,
    `Order Ref: ${input.orderNumber}`,
    `Job Order: ${input.joNumber}`,
    `Client: ${input.customerName}`,
    `Service: ${input.serviceName}`,
    `Current Stage: ${input.currentStage}`,
  ];
  if (input.totalSteps > 0) {
    lines.push(`Production Progress: Step ${input.stepIndex} of ${input.totalSteps}`);
  }
  lines.push("", "Order Details:", `${input.serviceName} — ${input.quantity.toLocaleString()} pcs`);
  lines.push("", input.bodySentence ?? defaultStageSentence(input.currentStage));
  if (input.trackingUrl) {
    lines.push("", "Track Your Order:", input.trackingUrl);
  }
  return lines.join("\n");
}
