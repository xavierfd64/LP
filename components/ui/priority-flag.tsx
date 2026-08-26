import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_LABELS, type JobOrderPriority } from "@/lib/production-board-types";

/**
 * Production Job Card / Side Panel priority flag (approved illustration's
 * "CARD ELEMENTS GUIDE": 🚩 High = needs immediate attention (red), Medium =
 * normal priority (amber), Low = low priority (slate/green)). One shared
 * component so every place a priority renders — Kanban card, list view,
 * side panel, Add Job dialog's auto-filled summary — uses the identical
 * icon + color + label, never a plain-text substitute.
 */
const TONE: Record<JobOrderPriority, { text: string; fill: string }> = {
  HIGH: { text: "text-red-600", fill: "fill-red-600" },
  MEDIUM: { text: "text-amber-600", fill: "fill-amber-600" },
  LOW: { text: "text-slate-400", fill: "fill-slate-400" },
};

export function PriorityFlag({ priority, className, showLabel = true }: { priority: JobOrderPriority; className?: string; showLabel?: boolean }) {
  const tone = TONE[priority];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", tone.text, className)}>
      <Flag className={cn("h-3.5 w-3.5", tone.fill)} />
      {showLabel && PRIORITY_LABELS[priority]}
    </span>
  );
}
