"use client";

import { useActionState, useState } from "react";
import { createRedemptionTierAction } from "@/app/actions/rewards";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function RedemptionTierForm() {
  const [error, formAction, pending] = useActionState(createRedemptionTierAction, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New Voucher Tier</Button>;
  }

  return (
    <form action={formAction} className="flex items-end gap-2 rounded-md border border-slate-200 p-3">
      {error && (
        <div className="w-full">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div>
        <Label htmlFor="pointsCost">Points cost</Label>
        <Input id="pointsCost" name="pointsCost" type="number" min={1} step="1" required className="w-28" />
      </div>
      <div>
        <Label htmlFor="voucherValue">Voucher value (₱)</Label>
        <Input id="voucherValue" name="voucherValue" type="number" min={1} step="1" required className="w-28" />
      </div>
      <div>
        <Label htmlFor="minimumSpend">Minimum order to use (₱)</Label>
        <Input id="minimumSpend" name="minimumSpend" type="number" min={1} step="1" required className="w-32" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Add Tier"}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
