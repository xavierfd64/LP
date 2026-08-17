"use client";

import { useActionState } from "react";
import { createQuotationAction } from "@/app/actions/quotations";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { LineItemsEditor } from "../line-items-editor";
import { CustomerPicker } from "@/components/customers/customer-picker";
import type { CustomerSearchResult } from "@/app/actions/customers";

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

      <CustomerPicker name="customerId" initialCustomer={defaultCustomer} />

      <div>
        <Label htmlFor="validUntil">Valid until</Label>
        <Input id="validUntil" name="validUntil" type="date" />
      </div>

      <LineItemsEditor
        initialItems={defaultLineItems ?? [{ productType: defaultProductType ?? "", description: "", qty: 1, unitPrice: 0 }]}
      />

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
