import {
  Package,
  FileText,
  PenLine,
  ClipboardList,
  PenTool,
  Printer,
  Flame,
  Layers,
  Scissors,
  ShieldCheck,
  ListOrdered,
  Boxes,
  Truck,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

/**
 * Presentation-only lookup: icon + a short activity phrase for the common,
 * out-of-the-box stage names (order-level steps plus the example
 * production workflow this system ships with). The actual stage LIST
 * shown on the public tracking page always comes from real data — a
 * business's configured WorkflowTemplate can rename or reorder stages, or
 * add ones not listed here — so lookups are case-insensitive and every
 * caller falls back to a generic icon/phrase for anything unmatched. This
 * file only decides how a stage *looks*, never which stages exist.
 */
const STAGE_ICONS: Record<string, LucideIcon> = {
  "order received": Package,
  quotation: FileText,
  approved: PenLine,
  "job order": ClipboardList,
  design: PenTool,
  printing: Printer,
  curing: Flame,
  laminating: Layers,
  cutting: Scissors,
  qc: ShieldCheck,
  "quality check": ShieldCheck,
  sorting: ListOrdered,
  packing: Boxes,
  releasing: Truck,
  completed: CheckCircle2,
};

const STAGE_ACTIVITY: Record<string, string> = {
  "order received": "your order",
  quotation: "the quotation",
  approved: "the quotation",
  "job order": "the job order",
  design: "the design",
  printing: "printing",
  curing: "curing",
  laminating: "laminating",
  cutting: "cutting",
  qc: "the quality check",
  "quality check": "the quality check",
  sorting: "sorting and counting",
  packing: "packing",
  releasing: "release",
  completed: "your order",
};

export function stageIcon(label: string): LucideIcon {
  return STAGE_ICONS[label.trim().toLowerCase()] ?? Package;
}

/** Short, state-aware status line under a stage's name, e.g. "Printing
 * completed." / "Printing in progress." / "Waiting to start printing." */
export function stageDescription(label: string, state: "done" | "current" | "upcoming"): string {
  const key = label.trim().toLowerCase();
  const activity = STAGE_ACTIVITY[key] ?? label;

  // A few stages read better as a fixed sentence than the generic
  // activity template, for both the known set and this fallback.
  if (key === "order received") {
    if (state === "done") return "We have received your order.";
    if (state === "current") return "We are receiving your order.";
    return "Your order has not been received yet.";
  }
  if (key === "quotation") {
    if (state === "done") return "Quotation has been sent and confirmed.";
    if (state === "current") return "Quotation is being prepared.";
    return "Quotation has not been sent yet.";
  }
  if (key === "approved") {
    if (state === "done") return "You have approved the quotation.";
    if (state === "current") return "Waiting for your approval.";
    return "Not yet approved.";
  }
  if (key === "job order") {
    if (state === "done") return "Job order has been created.";
    if (state === "current") return "Job order is being created.";
    return "Job order has not been created yet.";
  }
  if (key === "completed") {
    if (state === "done") return "Your order is complete.";
    if (state === "current") return "Finishing up your order.";
    return "Not yet completed.";
  }

  if (state === "done") return `${capitalize(activity)} completed.`;
  if (state === "current") return `${capitalize(activity)} in progress.`;
  return `Waiting to start ${activity}.`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
