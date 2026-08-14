"use client";

import { useActionState, useState } from "react";
import { forceApproveQuotationAction } from "@/app/actions/quotations";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function ForceApproveForm({ quotationId }: { quotationId: string }) {
  const action = forceApproveQuotationAction.bind(null, quotationId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Approve for Rush (bypass customer)
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-yellow-200 bg-yellow-50 p-4">
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-xs text-yellow-800">
        This approves the quotation on the customer&apos;s behalf. Only use this for rush jobs where waiting on
        the customer&apos;s own approval click isn&apos;t feasible — it&apos;s recorded separately in the audit
        trail from a genuine customer approval.
      </p>
      <Textarea name="reason" rows={2} required placeholder="Reason — e.g. rush order, verbally confirmed by client..." />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Approving..." : "Confirm Rush Approval"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Back
        </Button>
      </div>
    </form>
  );
}
