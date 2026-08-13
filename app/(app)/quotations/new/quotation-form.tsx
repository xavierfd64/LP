"use client";

import { useActionState, useState } from "react";
import { createQuotationAction } from "@/app/actions/quotations";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type Customer = { id: string; name: string; companyName: string | null };
type LineItem = { productType: string; description: string; qty: number; unitPrice: number };

export function QuotationForm({
  customers,
  inquiryId,
  defaultCustomerId,
  defaultProductType,
}: {
  customers: Customer[];
  inquiryId?: string;
  defaultCustomerId?: string;
  defaultProductType?: string;
}) {
  const [error, formAction, pending] = useActionState(createQuotationAction, undefined);
  const [items, setItems] = useState<LineItem[]>([
    { productType: defaultProductType ?? "", description: "", qty: 1, unitPrice: 0 },
  ]);

  const total = items.reduce((sum, li) => sum + (Number(li.qty) || 0) * (Number(li.unitPrice) || 0), 0);

  function updateItem(index: number, field: keyof LineItem, value: string) {
    setItems((prev) =>
      prev.map((li, i) => (i === index ? { ...li, [field]: field === "qty" || field === "unitPrice" ? Number(value) : value } : li))
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {inquiryId && <input type="hidden" name="inquiryId" value={inquiryId} />}

      <div>
        <Label htmlFor="customerId">Customer</Label>
        <Select id="customerId" name="customerId" required defaultValue={defaultCustomerId ?? ""}>
          <option value="">Select a customer...</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.companyName ? ` (${c.companyName})` : ""}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="validUntil">Valid until</Label>
        <Input id="validUntil" name="validUntil" type="date" />
      </div>

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
        <p className="mt-2 text-right text-sm font-semibold text-slate-900">
          Total: {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(total)}
        </p>
      </div>

      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save as Draft"}
      </Button>
    </form>
  );
}
