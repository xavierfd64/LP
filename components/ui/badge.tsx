import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "green" | "red" | "yellow" | "blue" | "slate" | "purple";

/**
 * Maps onto this app's established status-color language (Green=Completed/
 * Paid, Orange=Pending, Red=Overdue/Attention, Blue=Information/Production,
 * Purple=Special/System, Gray=Neutral/Cancelled) — and, as of the Aug 19
 * theme system, onto the customizable Success/Warning/Error/Info/Accent
 * design tokens (app/globals.css). Every status badge across the whole app
 * goes through this one mapping, so an Admin's color customization
 * recolors every badge everywhere from a single place, never per-page.
 * "slate"/"default" stay literal neutral gray — Neutral is deliberately
 * not one of the customizable tokens.
 */
const toneClasses: Record<Tone, string> = {
  default: "bg-slate-100 text-slate-700",
  green: "bg-success-100 text-success-800",
  red: "bg-error-100 text-error-800",
  yellow: "bg-warning-100 text-warning-800",
  blue: "bg-info-100 text-info-800",
  slate: "bg-slate-200 text-slate-800",
  purple: "bg-accent-100 text-accent-800",
};

export function Badge({
  className,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}

const STATUS_TONE: Record<string, Tone> = {
  NEW: "blue",
  QUOTED: "purple",
  CLOSED: "slate",
  DRAFT: "slate",
  SENT: "blue",
  APPROVED: "green",
  REJECTED: "red",
  OPEN: "blue",
  IN_PRODUCTION: "purple",
  FULFILLING: "purple",
  COMPLETED: "green",
  CANCELLED: "red",
  ON_HOLD: "yellow",
  IN_PROGRESS: "purple",
  QC: "blue",
  REWORK: "red",
  READY: "green",
  RELEASED: "green",
  PENDING: "yellow",
  CONFIRMED: "green",
  PASS: "green",
  FAIL: "red",
  DONE: "green",
  SCHEDULED: "blue",
  BOOKED: "blue",
  IN_TRANSIT: "purple",
  DELIVERED: "green",
  INSTALLED: "green",
  RECEIVED: "green",
  REVISION_REQUESTED: "yellow",
  AVAILABLE: "green",
  USED: "slate",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "default"}>{status.replace(/_/g, " ")}</Badge>
  );
}
