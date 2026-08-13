"use client";

import { useActionState, useState } from "react";
import { uploadPaymentProofAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function PaymentProofForm({ orderId }: { orderId: string }) {
  const [error, formAction, pending] = useActionState(uploadPaymentProofAction, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Upload Payment Proof
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-slate-200 p-4">
      <input type="hidden" name="orderId" value={orderId} />
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="amount">Amount paid (PHP)</Label>
        <Input id="amount" name="amount" type="number" min={0.01} step="0.01" required />
      </div>
      <div>
        <Label htmlFor="proofFile">Proof of payment</Label>
        <input id="proofFile" name="proofFile" type="file" required className="text-sm" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Uploading..." : "Submit"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
