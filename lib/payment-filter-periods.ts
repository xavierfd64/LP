/**
 * Pure constants/types only — no Prisma import — so the client-side
 * PaymentFilters component can import this without accidentally pulling
 * lib/payments-list.ts's server-only Prisma dependency into the browser
 * bundle.
 */
export const PAYMENT_FILTER_PERIODS = ["all", "daily", "monthly", "quarterly", "annual"] as const;
export type PaymentFilterPeriod = (typeof PAYMENT_FILTER_PERIODS)[number];

export const PAYMENT_FILTER_PERIOD_LABELS: Record<PaymentFilterPeriod, string> = {
  all: "All Time",
  daily: "Today",
  monthly: "This Month",
  quarterly: "This Quarter",
  annual: "This Year",
};
