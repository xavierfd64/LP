"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
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
  unit?: string | null;
  unitPrice: number;
  specs?: Record<string, string> | null;
};

export const emptyLineItem: LineItem = { serviceId: "", productType: "", description: "", qty: 1, unit: "", unitPrice: 0, specs: null };

export function lineItemAmount(li: LineItem): number {
  return (Number(li.qty) || 0) * (Number(li.unitPrice) || 0);
}

function toServiceResult(li: LineItem): ServiceSearchResult | null {
  if (!li.serviceId) return null;
  return { id: li.serviceId, name: li.productType, category: li.category ?? null, specFields: li.specFields ?? [], workflowTemplateId: null };
}

/**
 * Table-style line item editor (Aug 22 3rd update, matching the New
 * Quotation/Order illustration) — a real `<Table>` on desktop/tablet
 * (scrolls horizontally in its own container rather than the page), and
 * stacked cards on mobile so no horizontal page scroll is ever needed.
 *
 * Controlled by the parent form (which needs the running subtotal for its
 * Discount %/Tax % totals panel) rather than owning its own state.
 */
export function LineItemsEditor({ items, onChange }: { items: LineItem[]; onChange: (items: LineItem[]) => void }) {
  function updateItem(index: number, field: "description" | "qty" | "unit" | "unitPrice", value: string) {
    onChange(items.map((li, i) => (i === index ? { ...li, [field]: field === "qty" || field === "unitPrice" ? Number(value) : value } : li)));
  }

  function selectService(index: number, service: ServiceSearchResult) {
    onChange(
      items.map((li, i) =>
        i === index
          ? { ...li, serviceId: service.id, productType: service.name, category: service.category, specFields: service.specFields, specs: {} }
          : li
      )
    );
  }

  function updateSpecs(index: number, specs: Record<string, string>) {
    onChange(items.map((li, i) => (i === index ? { ...li, specs } : li)));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  // A single hidden JSON blob is the actual field the server action reads
  // (see parseLineItems in app/actions/quotations.ts) — the desktop table
  // and the mobile stacked cards below are two responsive presentations
  // of the SAME items, both always present in the DOM (only one visible
  // via CSS breakpoints), so per-row named inputs would each submit
  // twice. A single source of truth avoids that duplication entirely.
  const lineItemsJson = JSON.stringify(
    items.map((li) => ({
      serviceId: li.serviceId,
      productType: li.productType,
      description: li.description,
      qty: li.qty,
      unit: li.unit ?? "",
      unitPrice: li.unitPrice,
      specs: li.specs ?? {},
    }))
  );

  return (
    <div className="space-y-3">
      <input type="hidden" name="lineItemsJson" value={lineItemsJson} />
      {/* Desktop/tablet: real table */}
      <div className="hidden sm:block">
        <Table>
          <THead>
            <TR>
              <TH className="min-w-[180px]">Service / Item</TH>
              <TH className="min-w-[160px]">Description</TH>
              <TH className="w-20">Qty</TH>
              <TH className="w-24">Unit</TH>
              <TH className="w-28">Unit Price</TH>
              <TH className="w-28 text-right">Amount</TH>
              <TH className="w-10" />
            </TR>
          </THead>
          <TBody>
            {items.map((li, i) => (
              <TR key={i}>
                <TD>
                  <ServicePicker name={`serviceId-${i}`} initialService={toServiceResult(li)} onSelect={(s) => selectService(i, s)} />
                  {li.specFields && li.specFields.length > 0 && (
                    <div className="mt-2">
                      <SpecFieldsEditor name={`li-specs-${i}`} fields={li.specFields} initialSpecs={li.specs} onChange={(specs) => updateSpecs(i, specs)} />
                    </div>
                  )}
                </TD>
                <TD>
                  <Input
                    aria-label="Description"
                    placeholder="Description (optional)"
                    value={li.description}
                    onChange={(e) => updateItem(i, "description", e.target.value)}
                  />
                </TD>
                <TD>
                  <Input
                    aria-label="Quantity"
                    type="number"
                    min={1}
                    value={li.qty}
                    onChange={(e) => updateItem(i, "qty", e.target.value)}
                  />
                </TD>
                <TD>
                  <Input
                    aria-label="Unit"
                    placeholder="pcs"
                    value={li.unit ?? ""}
                    onChange={(e) => updateItem(i, "unit", e.target.value)}
                  />
                </TD>
                <TD>
                  <Input
                    aria-label="Unit price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={li.unitPrice}
                    onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
                  />
                </TD>
                <TD className="text-right font-medium text-slate-900">{formatCurrency(lineItemAmount(li))}</TD>
                <TD>
                  <button
                    type="button"
                    className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30"
                    onClick={() => removeItem(i)}
                    disabled={items.length === 1}
                    aria-label="Remove line item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {/* Mobile: stacked cards, no horizontal scroll */}
      <div className="space-y-3 sm:hidden">
        {items.map((li, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <ServicePicker name={`serviceId-m-${i}`} initialService={toServiceResult(li)} onSelect={(s) => selectService(i, s)} />
            <div>
              <Label htmlFor={`li-desc-m-${i}`}>Description</Label>
              <Input id={`li-desc-m-${i}`} placeholder="Description" value={li.description} onChange={(e) => updateItem(i, "description", e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor={`li-qty-m-${i}`}>Qty</Label>
                <Input id={`li-qty-m-${i}`} type="number" min={1} value={li.qty} onChange={(e) => updateItem(i, "qty", e.target.value)} />
              </div>
              <div>
                <Label htmlFor={`li-unit-m-${i}`}>Unit</Label>
                <Input id={`li-unit-m-${i}`} placeholder="pcs" value={li.unit ?? ""} onChange={(e) => updateItem(i, "unit", e.target.value)} />
              </div>
              <div>
                <Label htmlFor={`li-price-m-${i}`}>Price</Label>
                <Input id={`li-price-m-${i}`} type="number" min={0} step="0.01" value={li.unitPrice} onChange={(e) => updateItem(i, "unitPrice", e.target.value)} />
              </div>
            </div>
            {li.specFields && li.specFields.length > 0 && (
              <SpecFieldsEditor name={`li-specs-m-${i}`} fields={li.specFields} initialSpecs={li.specs} onChange={(specs) => updateSpecs(i, specs)} />
            )}
            <div className="flex items-center justify-between pt-1">
              <p className="text-sm font-semibold text-slate-900">Amount: {formatCurrency(lineItemAmount(li))}</p>
              <button type="button" className="text-xs font-medium text-red-600 disabled:opacity-30" onClick={() => removeItem(i)} disabled={items.length === 1}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, { ...emptyLineItem }])}>
        + Add Line Item
      </Button>
    </div>
  );
}
