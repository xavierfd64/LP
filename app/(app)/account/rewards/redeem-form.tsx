"use client";

import { useActionState, useState } from "react";
import { redeemPointsAction } from "@/app/actions/rewards";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";

type Tier = { id: string; pointsCost: number; voucherValue: number; minimumSpend: number };

export function RedeemForm({ balance, tiers }: { balance: number; tiers: Tier[] }) {
  const [error, formAction, pending] = useActionState(redeemPointsAction, undefined);
  const [open, setOpen] = useState(false);

  const affordable = tiers.filter((t) => t.pointsCost <= balance);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={affordable.length === 0}>
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
        <Label htmlFor="tierId">Voucher</Label>
        <Select id="tierId" name="tierId" required>
          {affordable.map((t) => (
            <option key={t.id} value={t.id}>
              {t.pointsCost} pts → {formatCurrency(t.voucherValue)} voucher (min. order {formatCurrency(t.minimumSpend)})
            </option>
          ))}
        </Select>
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
