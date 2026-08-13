"use client";

import { useState } from "react";
import { completeStageAction } from "@/app/actions/production";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export function CompleteStageForm({ jobOrderId, stageLogId }: { jobOrderId: string; stageLogId: string }) {
  const [open, setOpen] = useState(false);
  const action = completeStageAction.bind(null, jobOrderId, stageLogId);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Complete Stage
      </Button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <Textarea name="notes" placeholder="Notes (optional)" rows={1} className="w-40" />
      <Button type="submit" size="sm">
        Confirm
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
