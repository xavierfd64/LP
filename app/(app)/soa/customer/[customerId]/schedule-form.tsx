"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { saveStatementScheduleAction, toggleStatementScheduleAction } from "@/app/actions/soa";

type Schedule = { id: string; dayOfMonth: number; onlyIfOutstanding: boolean; enabled: boolean; lastRunAt: string | null } | null;

export function ScheduleForm({ customerId, schedule }: { customerId: string; schedule: Schedule }) {
  const action = saveStatementScheduleAction.bind(null, customerId);
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <div className="space-y-3">
      {schedule && (
        <div className="flex items-center gap-2">
          <Badge tone={schedule.enabled ? "green" : "slate"}>{schedule.enabled ? "Enabled" : "Disabled"}</Badge>
          {schedule.lastRunAt && <span className="text-xs text-slate-400">Last sent {new Date(schedule.lastRunAt).toLocaleDateString()}</span>}
          <form action={toggleStatementScheduleAction.bind(null, schedule.id, !schedule.enabled)}>
            <Button type="submit" size="sm" variant={schedule.enabled ? "destructive" : "default"}>
              {schedule.enabled ? "Disable" : "Enable"}
            </Button>
          </form>
        </div>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        {error && <Alert tone="error">{error}</Alert>}
        <div>
          <Label htmlFor="dayOfMonth">Day of Month</Label>
          <Input id="dayOfMonth" name="dayOfMonth" type="number" min={1} max={28} defaultValue={schedule?.dayOfMonth ?? 1} className="w-20" />
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          <input type="checkbox" id="onlyIfOutstanding" name="onlyIfOutstanding" defaultChecked={schedule?.onlyIfOutstanding ?? true} className="h-4 w-4" />
          <Label htmlFor="onlyIfOutstanding" className="mb-0">
            Only if outstanding balance exists
          </Label>
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : schedule ? "Update Schedule" : "Create Schedule"}
        </Button>
      </form>
      <p className="text-xs text-slate-400">
        Frequency: Monthly · Delivery: Email. Generates and emails the previous month&apos;s statement automatically once enabled.
      </p>
    </div>
  );
}
