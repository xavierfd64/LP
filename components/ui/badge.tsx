import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "green" | "red" | "yellow" | "blue" | "slate" | "purple";

const toneClasses: Record<Tone, string> = {
  default: "bg-slate-100 text-slate-700",
  green: "bg-green-100 text-green-800",
  red: "bg-red-100 text-red-800",
  yellow: "bg-yellow-100 text-yellow-800",
  blue: "bg-blue-100 text-blue-800",
  slate: "bg-slate-200 text-slate-800",
  purple: "bg-purple-100 text-purple-800",
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
