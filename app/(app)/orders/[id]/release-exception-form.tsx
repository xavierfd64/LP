"use client";

import { useActionState, useState } from "react";
import { grantReleaseExceptionAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function ReleaseExceptionForm({ orderId }: { orderId: string }) {
  const [error, formAction, pending] = useActionState(grantReleaseExceptionAction, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Grant Release Exception
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-slate-200 p-4">
      <input type="hidden" name="orderId" value={orderId} />
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="releaseExceptionBy">Authorized by</Label>
        <Input id="releaseExceptionBy" name="releaseExceptionBy" required placeholder="Name of approving manager" />
      </div>
      <div>
        <Label htmlFor="releaseExceptionReason">Reason</Label>
        <Textarea id="releaseExceptionReason" name="releaseExceptionReason" rows={2} required />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving..." : "Grant Exception"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
