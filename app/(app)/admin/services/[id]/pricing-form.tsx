"use client";

import { useActionState, useState } from "react";
import { updateServicePricingAction } from "@/app/actions/pricing";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { PricingTiersEditor, type Tier } from "./pricing-tiers-editor";
import { formatCurrency } from "@/lib/utils";

export function PricingForm({
  serviceId,
  pricingMethod,
  basePrice,
  minQuantity,
  instantQuoteEnabled,
  productionCost,
  tiers,
}: {
  serviceId: string;
  pricingMethod: string;
  basePrice: number | null;
  minQuantity: number | null;
  instantQuoteEnabled: boolean;
  productionCost: number | null;
  tiers: Tier[];
}) {
  const action = updateServicePricingAction.bind(null, serviceId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [method, setMethod] = useState(pricingMethod);
  const [priceInput, setPriceInput] = useState(basePrice != null ? String(basePrice) : "");
  const [costInput, setCostInput] = useState(productionCost != null ? String(productionCost) : "");

  const price = priceInput === "" ? null : Number(priceInput);
  const cost = costInput === "" ? null : Number(costInput);
  // spec item 8: never invent a profit when either side is unconfigured —
  // this is a live preview only, the same rule the server-side estimators
  // (lib/service-cost.ts) enforce for real, everywhere this pair is read.
  const canCompute = price != null && price > 0 && cost != null && !Number.isNaN(price) && !Number.isNaN(cost);
  const grossProfit = canCompute ? price - cost : null;
  const margin = canCompute && price > 0 ? (grossProfit! / price) * 100 : null;

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
          <Label htmlFor="basePrice">Selling Price</Label>
          <Input
            id="basePrice"
            name="basePrice"
            type="number"
            min={0}
            step="0.01"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            disabled={method === "NONE"}
          />
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

      <div className="rounded-lg border border-slate-200 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-700">Cost &amp; Profitability</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="productionCost">Base Production Cost</Label>
            <Input
              id="productionCost"
              name="productionCost"
              type="number"
              min={0}
              step="0.01"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              placeholder="Not configured"
            />
            <p className="mt-1 text-xs text-slate-400">Optional. Same unit as Selling Price (e.g. per sq.ft, per piece).</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Estimated Gross Profit</p>
            <p className="text-lg font-semibold text-slate-900">{canCompute ? formatCurrency(grossProfit!) : "—"}</p>
            {!canCompute && <p className="text-xs text-slate-400">Cost not configured</p>}
          </div>
          <div>
            <p className="text-xs text-slate-500">Estimated Margin</p>
            <p className="text-lg font-semibold text-slate-900">{canCompute ? `${margin!.toFixed(1)}%` : "—"}</p>
            {!canCompute && <p className="text-xs text-slate-400">Profit unavailable — production cost has not been configured.</p>}
          </div>
        </div>
      </div>

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
