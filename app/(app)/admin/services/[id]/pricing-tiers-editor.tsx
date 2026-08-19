"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

export type Tier = {
  minQty: number;
  maxQty: number | null;
  pricePerUnit: number | null;
  discountPercent: number | null;
};

/**
 * Bulk pricing tiers (spec Part G item 21) — each row is either a flat
 * per-unit override price OR a percent discount, never both (mirrors the
 * mutually-exclusive rule enforced server-side in lib/pricing.ts). Submits
 * as parallel hidden-input arrays, same convention as StageEditor.
 */
export function PricingTiersEditor({ initialTiers }: { initialTiers: Tier[] }) {
  const [tiers, setTiers] = useState<Array<{ minQty: string; maxQty: string; mode: "price" | "discount"; value: string }>>(
    initialTiers.length > 0
      ? initialTiers.map((t) => ({
          minQty: String(t.minQty),
          maxQty: t.maxQty != null ? String(t.maxQty) : "",
          mode: t.pricePerUnit != null ? "price" : "discount",
          value: String(t.pricePerUnit ?? t.discountPercent ?? ""),
        }))
      : []
  );

  function update(index: number, field: "minQty" | "maxQty" | "mode" | "value", value: string) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      {tiers.length === 0 && <p className="text-xs text-slate-400">No bulk pricing tiers — the base price applies at every quantity.</p>}
      {tiers.map((t, i) => (
        <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-12">
          <input type="hidden" name="tierMinQty" value={t.minQty} />
          <input type="hidden" name="tierMaxQty" value={t.maxQty} />
          <input type="hidden" name="tierMode" value={t.mode} />
          <input type="hidden" name="tierValue" value={t.value} />
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-500">Min qty</label>
            <Input type="number" min={1} value={t.minQty} onChange={(e) => update(i, "minQty", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-500">Max qty</label>
            <Input type="number" min={1} placeholder="No limit" value={t.maxQty} onChange={(e) => update(i, "maxQty", e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <label className="text-xs text-slate-500">Type</label>
            <Select value={t.mode} onChange={(e) => update(i, "mode", e.target.value)}>
              <option value="price">Flat unit price</option>
              <option value="discount">% discount</option>
            </Select>
          </div>
          <div className="sm:col-span-3">
            <label className="text-xs text-slate-500">{t.mode === "price" ? "Price / unit" : "Discount %"}</label>
            <Input type="number" min={0} step="0.01" value={t.value} onChange={(e) => update(i, "value", e.target.value)} />
          </div>
          <button
            type="button"
            className="col-span-2 justify-self-end text-xs text-red-600 hover:underline sm:col-span-2"
            onClick={() => setTiers((prev) => prev.filter((_, idx) => idx !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setTiers((prev) => [...prev, { minQty: "", maxQty: "", mode: "price", value: "" }])}
      >
        + Add tier
      </Button>
    </div>
  );
}
