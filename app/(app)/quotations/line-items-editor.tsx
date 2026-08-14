"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

export type LineItem = { productType: string; description: string; qty: number; unitPrice: number };

export function LineItemsEditor({ initialItems }: { initialItems: LineItem[] }) {
  const [items, setItems] = useState<LineItem[]>(
    initialItems.length > 0 ? initialItems : [{ productType: "", description: "", qty: 1, unitPrice: 0 }]
  );

  const total = items.reduce((sum, li) => sum + (Number(li.qty) || 0) * (Number(li.unitPrice) || 0), 0);

  function updateItem(index: number, field: keyof LineItem, value: string) {
    setItems((prev) =>
      prev.map((li, i) => (i === index ? { ...li, [field]: field === "qty" || field === "unitPrice" ? Number(value) : value } : li))
    );
  }

  return (
    <div>
      <Label>Line items</Label>
      <div className="space-y-2 rounded-md border border-slate-200 p-3">
        {items.map((li, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <input type="hidden" name="productType" value={li.productType} />
            <input type="hidden" name="description" value={li.description} />
            <input type="hidden" name="qty" value={li.qty} />
            <input type="hidden" name="unitPrice" value={li.unitPrice} />
            <Input
              className="col-span-3"
              placeholder="Product type"
              value={li.productType}
              onChange={(e) => updateItem(i, "productType", e.target.value)}
            />
            <Input
              className="col-span-4"
              placeholder="Description"
              value={li.description}
              onChange={(e) => updateItem(i, "description", e.target.value)}
            />
            <Input
              className="col-span-2"
              type="number"
              min={1}
              placeholder="Qty"
              value={li.qty}
              onChange={(e) => updateItem(i, "qty", e.target.value)}
            />
            <Input
              className="col-span-2"
              type="number"
              min={0}
              step="0.01"
              placeholder="Unit price"
              value={li.unitPrice}
              onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
            />
            <button
              type="button"
              className="col-span-1 text-xs text-red-600 hover:underline"
              onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
              disabled={items.length === 1}
            >
              Remove
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setItems((prev) => [...prev, { productType: "", description: "", qty: 1, unitPrice: 0 }])}
        >
          + Add line
        </Button>
      </div>
      <p className="mt-2 text-right text-sm font-semibold text-slate-900">Total: {formatCurrency(total)}</p>
    </div>
  );
}
