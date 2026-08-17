"use client";

import { useActionState } from "react";
import { createQuotationAction } from "@/app/actions/quotations";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { LineItemsEditor } from "../line-items-editor";
import { CustomerPicker } from "@/components/customers/customer-picker";
import type { CustomerSearchResult } from "@/app/actions/customers";
import { FormSection } from "@/components/documents/form-section";

export function QuotationForm({
  inquiryId,
  defaultCustomer,
  defaultProductType,
  defaultLineItems,
}: {
  inquiryId?: string;
  defaultCustomer?: CustomerSearchResult | null;
  defaultProductType?: string;
  defaultLineItems?: { productType: string; description: string; qty: number; unitPrice: number }[];
}) {
  const [error, formAction, pending] = useActionState(createQuotationAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {inquiryId && <input type="hidden" name="inquiryId" value={inquiryId} />}

      <FormSection title="Customer Information">
        <CustomerPicker name="customerId" initialCustomer={defaultCustomer} />
      </FormSection>

      <FormSection title="Transaction Information">
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
      </FormSection>

      <FormSection title="Items / Services">
        <LineItemsEditor
          initialItems={defaultLineItems ?? [{ productType: defaultProductType ?? "", description: "", qty: 1, unitPrice: 0 }]}
        />
      </FormSection>

      <FormSection title="Notes">
        <Textarea id="notes" name="notes" rows={2} placeholder="Optional notes for this quotation…" />
      </FormSection>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save as Draft"}
      </Button>
    </form>
  );
}
