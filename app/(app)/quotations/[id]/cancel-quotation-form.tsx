"use client";

import { useActionState, useState } from "react";
import { cancelQuotationAction } from "@/app/actions/quotations";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function CancelQuotationForm({ quotationId }: { quotationId: string }) {
  const action = cancelQuotationAction.bind(null, quotationId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Cancel Quotation
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Textarea
        name="reason"
        rows={2}
        required
        placeholder="Reason — e.g. customer requested cancellation, pricing error..."
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          {pending ? "Cancelling..." : "Confirm Cancel"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Back
        </Button>
      </div>
    </form>
  );
}
