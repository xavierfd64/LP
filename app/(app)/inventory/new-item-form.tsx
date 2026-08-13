"use client";

import { useActionState, useState } from "react";
import { createInventoryItemAction } from "@/app/actions/inventory";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function NewItemForm() {
  const [error, formAction, pending] = useActionState(createInventoryItemAction, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New Item</Button>;
  }

  return (
    <form action={formAction} className="grid grid-cols-5 items-end gap-2 rounded-md border border-slate-200 p-3">
      {error && (
        <div className="col-span-5">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div>
        <Label htmlFor="sku">SKU</Label>
        <Input id="sku" name="sku" required placeholder="e.g. VINYL-13OZ" />
      </div>
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div>
        <Label htmlFor="unit">Unit</Label>
        <Input id="unit" name="unit" required placeholder="e.g. meter" />
      </div>
      <div>
        <Label htmlFor="reorderThreshold">Reorder threshold</Label>
        <Input id="reorderThreshold" name="reorderThreshold" type="number" min={0} defaultValue={0} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Add Item"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
