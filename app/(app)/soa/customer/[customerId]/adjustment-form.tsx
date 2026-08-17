"use client";

import { useActionState, useState } from "react";
import { addAccountAdjustmentAction } from "@/app/actions/soa";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function AdjustmentForm({ customerId }: { customerId: string }) {
  const action = addAccountAdjustmentAction.bind(null, customerId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Add Adjustment / Credit
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="type">Type</Label>
          <Select id="type" name="type">
            <option value="CREDIT">Credit (reduces balance)</option>
            <option value="CHARGE">Charge (increases balance)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="amount">Amount (PHP)</Label>
          <Input id="amount" name="amount" type="number" min={0.01} step="0.01" required />
        </div>
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" required placeholder="e.g. Goodwill credit, billing correction" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Add"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
