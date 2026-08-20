"use client";

import { useActionState } from "react";
import { updateTargetMarginAction } from "@/app/actions/service-costing";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function TargetMarginForm({ serviceId, targetMarginPct }: { serviceId: string; targetMarginPct: number | null }) {
  const [error, formAction, pending] = useActionState(updateTargetMarginAction.bind(null, serviceId), undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {error && (
        <div className="basis-full">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div>
        <Label htmlFor="targetMarginPct">Target Margin %</Label>
        <Input id="targetMarginPct" name="targetMarginPct" type="number" min={0} max={99.99} step="0.01" defaultValue={targetMarginPct ?? ""} placeholder="e.g. 30" className="w-32" />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save Target Margin"}
      </Button>
    </form>
  );
}
