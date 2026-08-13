"use client";

import { useState } from "react";
import { createFulfillmentAction } from "@/app/actions/fulfillment";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export function CreateFulfillmentForm({ jobOrderId, allowInstall }: { jobOrderId: string; allowInstall: boolean }) {
  const [method, setMethod] = useState<"PICKUP" | "DELIVERY" | "INSTALLATION">("PICKUP");
  const action = createFulfillmentAction.bind(null, jobOrderId);

  return (
    <form action={action} className="space-y-3 rounded-md border border-slate-200 p-4">
      <div>
        <Label htmlFor="method">Fulfillment method</Label>
        <Select id="method" name="method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="PICKUP">Pickup</option>
          <option value="DELIVERY">Delivery</option>
          {allowInstall && <option value="INSTALLATION">Installation</option>}
        </Select>
      </div>
      <div>
        <Label htmlFor="scheduledDate">Scheduled date</Label>
        <Input id="scheduledDate" name="scheduledDate" type="date" />
      </div>
      {method === "DELIVERY" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="courier">Courier</Label>
            <Input id="courier" name="courier" placeholder="e.g. LBC" />
          </div>
          <div>
            <Label htmlFor="trackingNumber">Tracking number</Label>
            <Input id="trackingNumber" name="trackingNumber" />
          </div>
        </div>
      )}
      <Button type="submit" size="sm">
        Schedule Fulfillment
      </Button>
    </form>
  );
}
