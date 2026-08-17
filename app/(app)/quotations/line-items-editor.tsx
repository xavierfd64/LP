"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { ServicePicker } from "@/components/services/service-picker";
import { SpecFieldsEditor } from "@/components/services/spec-fields-editor";
import type { ServiceSearchResult } from "@/app/actions/services";

export type LineItem = {
  serviceId: string;
  /** Snapshot of the Service's name at the time this line was added — kept stable even if the Service Master is later renamed. */
  productType: string;
  category?: string | null;
  specFields?: string[];
  description: string;
  qty: number;
  unitPrice: number;
  specs?: Record<string, string> | null;
};

const emptyItem: LineItem = { serviceId: "", productType: "", description: "", qty: 1, unitPrice: 0, specs: null };

function toServiceResult(li: LineItem): ServiceSearchResult | null {
  if (!li.serviceId) return null;
  return { id: li.serviceId, name: li.productType, category: li.category ?? null, specFields: li.specFields ?? [], workflowTemplateId: null };
}

export function LineItemsEditor({ initialItems }: { initialItems: LineItem[] }) {
  const [items, setItems] = useState<LineItem[]>(initialItems.length > 0 ? initialItems : [emptyItem]);

  const total = items.reduce((sum, li) => sum + (Number(li.qty) || 0) * (Number(li.unitPrice) || 0), 0);

  function updateItem(index: number, field: "description" | "qty" | "unitPrice", value: string) {
    setItems((prev) =>
      prev.map((li, i) => (i === index ? { ...li, [field]: field === "qty" || field === "unitPrice" ? Number(value) : value } : li))
    );
  }

  function selectService(index: number, service: ServiceSearchResult) {
    setItems((prev) =>
      prev.map((li, i) =>
        i === index
          ? { ...li, serviceId: service.id, productType: service.name, category: service.category, specFields: service.specFields, specs: {} }
          : li
      )
    );
  }

  function updateSpecs(index: number, specs: Record<string, string>) {
    setItems((prev) => prev.map((li, i) => (i === index ? { ...li, specs } : li)));
  }

  return (
    <div>
      <Label>Line items</Label>
      <div className="space-y-3 rounded-md border border-slate-200 p-3">
        {items.map((li, i) => (
          <div key={i} className="space-y-2 rounded border border-slate-100 p-2">
            <input type="hidden" name="productType" value={li.productType} />
            <input type="hidden" name="specs" value={li.specs ? JSON.stringify(li.specs) : "{}"} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-12 sm:items-end">
              <div className="col-span-2 sm:col-span-4">
                <ServicePicker name="serviceId" initialService={toServiceResult(li)} onSelect={(s) => selectService(i, s)} />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor={`li-desc-${i}`}>Description</Label>
                <Input
                  id={`li-desc-${i}`}
                  placeholder="Description"
                  value={li.description}
                  onChange={(e) => updateItem(i, "description", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`li-qty-${i}`}>Qty</Label>
                <Input
                  id={`li-qty-${i}`}
                  type="number"
                  min={1}
                  placeholder="Qty"
                  value={li.qty}
                  onChange={(e) => updateItem(i, "qty", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`li-price-${i}`}>Unit price</Label>
                <Input
                  id={`li-price-${i}`}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Unit price"
                  value={li.unitPrice}
                  onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
                />
              </div>
              <button
                type="button"
                className="col-span-2 justify-self-end text-xs text-red-600 hover:underline sm:col-span-1"
                onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={items.length === 1}
              >
                Remove
              </button>
            </div>
            {li.specFields && li.specFields.length > 0 && (
              <SpecFieldsEditor
                name={`li-specs-${i}`}
                fields={li.specFields}
                initialSpecs={li.specs}
                onChange={(specs) => updateSpecs(i, specs)}
              />
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, emptyItem])}>
          + Add line
        </Button>
      </div>
      <p className="mt-2 text-right text-sm font-semibold text-slate-900">Total: {formatCurrency(total)}</p>
    </div>
  );
}
