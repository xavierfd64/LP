"use client";

import { useActionState, useState } from "react";
import { receiveLotAction } from "@/app/actions/inventory";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function ReceiveLotForm({ itemId }: { itemId: string }) {
  const [error, formAction, pending] = useActionState(receiveLotAction, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Receive New Lot
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex items-end gap-2 rounded-md border border-slate-200 p-3">
      <input type="hidden" name="itemId" value={itemId} />
      {error && (
        <div className="w-full">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div>
        <Label htmlFor="receivedQty">Quantity received</Label>
        <Input id="receivedQty" name="receivedQty" type="number" min={1} required className="w-28" />
      </div>
      <div>
        <Label htmlFor="supplier">Supplier (optional)</Label>
        <Input id="supplier" name="supplier" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving..." : "Receive"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
