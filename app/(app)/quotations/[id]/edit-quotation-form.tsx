"use client";

import { useActionState, useState } from "react";
import { editQuotationAction } from "@/app/actions/quotations";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { LineItemsEditor, LineItem, lineItemAmount } from "../line-items-editor";
import { TotalsPanel } from "@/components/documents/editor-shell";
import { formatCurrency } from "@/lib/utils";
import { computeTotals, type DiscountType } from "@/lib/pricing-totals";

export function EditQuotationForm({
  quotationId,
  lineItems,
  notes,
  discountType: initialDiscountType,
  discountValue: initialDiscountValue,
  taxPct: initialTaxPct,
}: {
  quotationId: string;
  lineItems: LineItem[];
  notes: string | null;
  /** Current stored values — preserved as the form's starting point (Sept 3 pricing correction: editing must not silently reset an existing discount/tax). */
  discountType: DiscountType;
  discountValue: number;
  taxPct: number;
}) {
  const action = editQuotationAction.bind(null, quotationId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LineItem[]>(lineItems);
  const [discountType, setDiscountType] = useState<DiscountType>(initialDiscountType);
  const [discountValue, setDiscountValue] = useState(initialDiscountValue);
  const [taxPct, setTaxPct] = useState(initialTaxPct);

  const rawSubtotal = items.reduce((sum, li) => sum + lineItemAmount(li), 0);
  const totals = computeTotals({ subtotal: rawSubtotal, discountType, discountValue, taxPct });

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit Quotation
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="validUntil">Valid until</Label>
        <Input id="validUntil" name="validUntil" type="date" />
      </div>
      <LineItemsEditor items={items} onChange={setItems} />

      <TotalsPanel
        rows={[
          { label: "Subtotal", value: formatCurrency(totals.subtotal) },
          ...(totals.discountAmount > 0 ? [{ label: totals.discountLabel ?? "Discount", value: formatCurrency(totals.discountAmount), negative: true }] : []),
          ...(totals.taxAmount > 0 ? [{ label: `Tax / VAT (${totals.taxPct}%)`, value: formatCurrency(totals.taxAmount) }] : []),
        ]}
        total={{ label: "Grand Total", value: formatCurrency(totals.total) }}
      />
      <div className="ml-auto grid w-full grid-cols-2 gap-3 sm:w-80">
        <div>
          <Label htmlFor="edit-discountType">Discount Type</Label>
          <Select
            id="edit-discountType"
            name="discountType"
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as DiscountType)}
          >
            <option value="PERCENTAGE">Percentage</option>
            <option value="FIXED">Fixed Amount</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="edit-discountValue">{discountType === "FIXED" ? "Discount (₱)" : "Discount (%)"}</Label>
          <Input
            id="edit-discountValue"
            name="discountValue"
            type="number"
            min={0}
            max={discountType === "PERCENTAGE" ? 100 : undefined}
            step="0.01"
            value={discountValue}
            onChange={(e) => setDiscountValue(Number(e.target.value))}
          />
          {discountType === "FIXED" && discountValue > rawSubtotal && rawSubtotal > 0 && (
            <p className="mt-1 text-xs text-amber-600">Capped to the subtotal ({formatCurrency(rawSubtotal)}).</p>
          )}
        </div>
        <div className="col-span-2">
          <Label htmlFor="edit-taxPct">Tax / VAT (%)</Label>
          <Input
            id="edit-taxPct"
            name="taxPct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={taxPct}
            onChange={(e) => setTaxPct(Number(e.target.value))}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={notes ?? ""} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving..." : "Save Changes"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
