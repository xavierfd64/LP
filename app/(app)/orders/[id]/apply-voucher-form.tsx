"use client";

import { useActionState, useState } from "react";
import { applyVoucherAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";

type VoucherOption = { id: string; code: string; value: number; minimumSpend: number };

export function ApplyVoucherForm({ orderId, vouchers }: { orderId: string; vouchers: VoucherOption[] }) {
  const [error, formAction, pending] = useActionState(applyVoucherAction, undefined);
  const [open, setOpen] = useState(false);

  if (vouchers.length === 0) return null;

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Pay with Voucher
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-slate-200 p-4">
      <input type="hidden" name="orderId" value={orderId} />
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="voucherId">Available vouchers</Label>
        <Select id="voucherId" name="voucherId" required>
          {vouchers.map((v) => (
            <option key={v.id} value={v.id}>
              {v.code} — {formatCurrency(v.value)} (min. order {formatCurrency(v.minimumSpend)})
            </option>
          ))}
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Applying..." : "Apply Voucher"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
