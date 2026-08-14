"use client";

import { useActionState, useState } from "react";
import { requestQuotationRevisionAction } from "@/app/actions/quotations";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function RevisionRequestForm({ quotationId }: { quotationId: string }) {
  const action = requestQuotationRevisionAction.bind(null, quotationId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Request Changes
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-slate-200 p-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Textarea
        name="message"
        rows={3}
        required
        placeholder="What would you like changed? e.g. increase quantity to 50, add lanyards too, use a different fabric..."
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending..." : "Send Request"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
