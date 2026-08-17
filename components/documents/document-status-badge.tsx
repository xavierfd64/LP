import { cn } from "@/lib/utils";

/**
 * Print-safe status badge — border + tinted background + colored text
 * rather than a solid fill, since browsers inconsistently print background
 * colors without explicit opt-in. Covers every status the Quotation,
 * Invoice, and Job Order documents can show, including the derived
 * payment-status labels (UNPAID/PARTIALLY_PAID/PAID) that don't exist as a
 * stored enum anywhere — they're computed from amount paid vs. total.
 */
const TONE_STYLE = {
  green: "border-green-300 bg-green-50 text-green-700",
  red: "border-red-300 bg-red-50 text-red-700",
  amber: "border-amber-300 bg-amber-50 text-amber-700",
  blue: "border-blue-300 bg-blue-50 text-blue-700",
  purple: "border-purple-300 bg-purple-50 text-purple-700",
  slate: "border-slate-300 bg-slate-50 text-slate-700",
} as const;

const STATUS_TONE: Record<string, keyof typeof TONE_STYLE> = {
  DRAFT: "slate",
  SENT: "blue",
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  REVISION_REQUESTED: "amber",
  MODIFICATION_REQUESTED: "amber",
  CANCELLED: "red",
  OPEN: "blue",
  IN_PRODUCTION: "purple",
  FULFILLING: "purple",
  ON_HOLD: "amber",
  IN_PROGRESS: "purple",
  QC: "blue",
  REWORK: "red",
  READY: "green",
  RELEASED: "green",
  COMPLETED: "green",
  CONFIRMED: "green",
  UNPAID: "red",
  PARTIALLY_PAID: "amber",
  PAID: "green",
  CURRENT: "blue",
  DUE: "amber",
  OVERDUE: "red",
};

export function DocumentStatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? "slate";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        TONE_STYLE[tone],
        className
      )}
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
