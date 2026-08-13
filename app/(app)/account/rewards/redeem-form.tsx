"use client";

import { useActionState, useState } from "react";
import { redeemPointsAction } from "@/app/actions/rewards";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function RedeemForm({ balance }: { balance: number }) {
  const [error, formAction, pending] = useActionState(redeemPointsAction, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={balance <= 0}>
        Redeem Points
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex items-end gap-2 rounded-md border border-slate-200 p-3">
      {error && (
        <div className="w-full">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div>
        <Label htmlFor="points">Points to redeem</Label>
        <Input id="points" name="points" type="number" min={1} max={balance} required className="w-28" />
      </div>
      <div>
        <Label htmlFor="description">What for?</Label>
        <Input id="description" name="description" required placeholder="e.g. Discount voucher" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Redeeming..." : "Redeem"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
