"use client";

import { useActionState, useState } from "react";
import { createRewardRuleAction } from "@/app/actions/rewards";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function RewardRuleForm() {
  const [error, formAction, pending] = useActionState(createRewardRuleAction, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New Rule</Button>;
  }

  return (
    <form action={formAction} className="flex items-end gap-2 rounded-md border border-slate-200 p-3">
      {error && (
        <div className="w-full">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required placeholder="e.g. Standard Earn Rate" />
      </div>
      <div>
        <Label htmlFor="pointsPerCurrencyUnit">Points earned</Label>
        <Input id="pointsPerCurrencyUnit" name="pointsPerCurrencyUnit" type="number" min={0.01} step="0.01" defaultValue={1} required className="w-28" />
      </div>
      <div>
        <Label htmlFor="currencyUnit">Per ₱ spent</Label>
        <Input id="currencyUnit" name="currencyUnit" type="number" min={1} step="1" defaultValue={100} required className="w-28" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Add Rule"}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
