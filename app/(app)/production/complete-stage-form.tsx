"use client";

import { useState } from "react";
import { completeStageAction } from "@/app/actions/production";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export function CompleteStageForm({
  jobOrderId,
  stageLogId,
  label = "Complete Stage",
  compact = false,
}: {
  jobOrderId: string;
  stageLogId: string;
  label?: React.ReactNode;
  /** Kanban-card sizing — smaller button/inputs to fit a compact action row. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const action = completeStageAction.bind(null, jobOrderId, stageLogId);
  const btnClass = compact ? "h-7 px-2 text-xs" : undefined;

  if (!open) {
    return (
      <Button size="sm" className={btnClass} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <p className="text-xs font-medium text-slate-500">Confirm moving to the next stage:</p>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <Textarea name="notes" placeholder="Notes (optional)" rows={1} className={compact ? "w-full text-xs" : "w-40"} />
        <Button type="submit" size="sm" className={btnClass}>
          Confirm
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btnClass} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </form>
    </div>
  );
}
