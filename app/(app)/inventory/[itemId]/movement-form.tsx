"use client";

import { useActionState, useState } from "react";
import { recordMovementAction } from "@/app/actions/inventory";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type JobOrderOpt = { id: string; joNumber: string; orderNumber: string };

export function MovementForm({ lotId, remainingQty, jobOrders }: { lotId: string; remainingQty: number; jobOrders: JobOrderOpt[] }) {
  const [error, formAction, pending] = useActionState(recordMovementAction, undefined);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("ALLOCATE");

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Record Movement
      </Button>
    );
  }

  const needsJobOrder = type === "ALLOCATE" || type === "CONSUME";

  return (
    <form action={formAction} className="space-y-2 rounded-md border border-slate-200 p-3">
      <input type="hidden" name="lotId" value={lotId} />
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-xs text-slate-500">Remaining in lot: {remainingQty}</p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label htmlFor="type">Type</Label>
          <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="ALLOCATE">Allocate</option>
            <option value="CONSUME">Consume</option>
            <option value="REJECT">Reject</option>
            <option value="WASTE">Waste</option>
            <option value="ADJUST">Adjust (+/-)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="qty">Quantity{type === "ADJUST" ? " (use - to subtract)" : ""}</Label>
          <Input id="qty" name="qty" type="number" required />
        </div>
        {needsJobOrder && (
          <div>
            <Label htmlFor="jobOrderId">Job Order</Label>
            <Select id="jobOrderId" name="jobOrderId">
              <option value="">None</option>
              {jobOrders.map((jo) => (
                <option key={jo.id} value={jo.id}>
                  {jo.joNumber} ({jo.orderNumber})
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={1} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving..." : "Submit"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
