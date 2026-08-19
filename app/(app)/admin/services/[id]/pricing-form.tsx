"use client";

import { useActionState, useState } from "react";
import { updateServicePricingAction } from "@/app/actions/pricing";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { PricingTiersEditor, type Tier } from "./pricing-tiers-editor";

export function PricingForm({
  serviceId,
  pricingMethod,
  basePrice,
  minQuantity,
  instantQuoteEnabled,
  tiers,
}: {
  serviceId: string;
  pricingMethod: string;
  basePrice: number | null;
  minQuantity: number | null;
  instantQuoteEnabled: boolean;
  tiers: Tier[];
}) {
  const action = updateServicePricingAction.bind(null, serviceId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [method, setMethod] = useState(pricingMethod);

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="pricingMethod">Pricing Method</Label>
          <Select id="pricingMethod" name="pricingMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="NONE">None (staff review)</option>
            <option value="PER_PIECE">Per Piece</option>
            <option value="FIXED">Fixed Price</option>
            <option value="PER_SET">Per Set</option>
            <option value="PER_AREA">Per Area</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="basePrice">Base Price</Label>
          <Input id="basePrice" name="basePrice" type="number" min={0} step="0.01" defaultValue={basePrice ?? ""} disabled={method === "NONE"} />
        </div>
        <div>
          <Label htmlFor="minQuantity">Minimum Quantity</Label>
          <Input id="minQuantity" name="minQuantity" type="number" min={1} defaultValue={minQuantity ?? ""} placeholder="No minimum" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="instantQuoteEnabled" defaultChecked={instantQuoteEnabled} />
        Instant Quotation — automatically quote customers who submit an Inquiry for this service
      </label>

      <div>
        <Label>Bulk Pricing Tiers</Label>
        <PricingTiersEditor initialTiers={tiers} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save Pricing"}
      </Button>
    </form>
  );
}
