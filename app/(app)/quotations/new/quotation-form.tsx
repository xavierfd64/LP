"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createQuotationAction } from "@/app/actions/quotations";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { LineItemsEditor, lineItemAmount, emptyLineItem, type LineItem } from "../line-items-editor";
import { LineItemsView } from "@/components/documents/line-items-view";
import { CustomerPicker } from "@/components/customers/customer-picker";
import type { CustomerSearchResult } from "@/app/actions/customers";
import { FormSectionCard } from "@/components/documents/form-section-card";
import { TotalsPanel } from "@/components/documents/editor-shell";
import { formatCurrency } from "@/lib/utils";

export function QuotationForm({
  inquiryId,
  defaultCustomer,
  defaultLineItems,
  canSend,
}: {
  inquiryId?: string;
  defaultCustomer?: CustomerSearchResult | null;
  defaultLineItems?: LineItem[];
  canSend: boolean;
}) {
  const [error, formAction, pending] = useActionState(createQuotationAction, undefined);
  const [items, setItems] = useState<LineItem[]>(defaultLineItems && defaultLineItems.length > 0 ? defaultLineItems : [{ ...emptyLineItem }]);
  const [discountPct, setDiscountPct] = useState(0);
  const [taxPct, setTaxPct] = useState(12);
  const [showPreview, setShowPreview] = useState(false);

  const subtotal = items.reduce((sum, li) => sum + lineItemAmount(li), 0);
  const discountAmount = (subtotal * (Number(discountPct) || 0)) / 100;
  const taxAmount = (subtotal - discountAmount) * ((Number(taxPct) || 0) / 100);
  const grandTotal = subtotal - discountAmount + taxAmount;

  return (
    <form action={formAction} className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}
      {inquiryId && <input type="hidden" name="inquiryId" value={inquiryId} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <FormSectionCard number={1} title="Customer Information" tone="purple">
          <CustomerPicker name="customerId" initialCustomer={defaultCustomer} />
        </FormSectionCard>

        <FormSectionCard number={2} title="Quotation Information" tone="blue">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="validUntil">Valid Until</Label>
              <Input id="validUntil" name="validUntil" type="date" />
            </div>
            <div>
              <Label>Status</Label>
              <p className="flex h-9 items-center text-sm text-slate-500">Draft (send once ready)</p>
            </div>
          </div>
        </FormSectionCard>
      </div>

      <FormSectionCard number={3} title="Services / Line Items" tone="purple">
        <LineItemsEditor items={items} onChange={setItems} />
        <TotalsPanel
          rows={[
            { label: "Subtotal", value: formatCurrency(subtotal) },
            ...(discountAmount > 0 ? [{ label: `Discount (${discountPct}%)`, value: formatCurrency(discountAmount), negative: true }] : []),
            ...(taxAmount > 0 ? [{ label: `Tax / VAT (${taxPct}%)`, value: formatCurrency(taxAmount) }] : []),
          ]}
          total={{ label: "Grand Total", value: formatCurrency(grandTotal) }}
        />
        <div className="ml-auto grid w-full grid-cols-2 gap-3 sm:w-80">
          <div>
            <Label htmlFor="discountPct">Discount (%)</Label>
            <Input
              id="discountPct"
              name="discountPct"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={discountPct}
              onChange={(e) => setDiscountPct(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="taxPct">Tax / VAT (%)</Label>
            <Input
              id="taxPct"
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
      </FormSectionCard>

      <FormSectionCard number={4} title="Notes / Terms" tone="orange">
        <Textarea id="notes" name="notes" rows={3} maxLength={1000} placeholder="Add notes, terms, conditions, or special instructions..." />
      </FormSectionCard>

      {showPreview && (
        <FormSectionCard number={5} title="Preview" tone="green">
          <LineItemsView
            items={items
              .filter((li) => li.serviceId)
              .map((li, i) => ({ id: String(i), productType: li.productType, description: li.description, qty: li.qty, unitPrice: li.unitPrice }))}
          />
          <TotalsPanel
            rows={[
              { label: "Subtotal", value: formatCurrency(subtotal) },
              ...(discountAmount > 0 ? [{ label: `Discount (${discountPct}%)`, value: formatCurrency(discountAmount), negative: true }] : []),
              ...(taxAmount > 0 ? [{ label: `Tax / VAT (${taxPct}%)`, value: formatCurrency(taxAmount) }] : []),
            ]}
            total={{ label: "Grand Total", value: formatCurrency(grandTotal) }}
          />
        </FormSectionCard>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="submit" name="intent" value="draft" size="lg" disabled={pending}>
          {pending ? "Saving..." : "Save as Draft"}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? "Hide Preview" : "Preview Quotation"}
        </Button>
        {canSend && (
          <Button type="submit" name="intent" value="send" variant="outline" size="lg" disabled={pending}>
            {pending ? "Sending..." : "Send for Approval"}
          </Button>
        )}
        <Link href="/quotations">
          <Button type="button" variant="ghost" size="lg" className="w-full sm:w-auto">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}
