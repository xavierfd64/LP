"use client";

import { useState } from "react";
import { uploadDeliveryProofAction } from "@/app/actions/fulfillment";
import { Button } from "@/components/ui/button";

export function DeliveryProofForm({ fulfillmentId, jobOrderId }: { fulfillmentId: string; jobOrderId: string }) {
  const [open, setOpen] = useState(false);
  const action = uploadDeliveryProofAction.bind(null, fulfillmentId, jobOrderId);

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Upload Proof of Delivery
      </Button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="file" name="proofFile" required className="text-xs" />
      <Button type="submit" size="sm">
        Upload
      </Button>
    </form>
  );
}
