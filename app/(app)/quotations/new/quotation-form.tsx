"use client";

import { useActionState } from "react";
import { createQuotationAction } from "@/app/actions/quotations";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { LineItemsEditor } from "../line-items-editor";

type Customer = { id: string; name: string; companyName: string | null };

export function QuotationForm({
  customers,
  inquiryId,
  defaultCustomerId,
  defaultProductType,
  defaultLineItems,
}: {
  customers: Customer[];
  inquiryId?: string;
  defaultCustomerId?: string;
  defaultProductType?: string;
  defaultLineItems?: { productType: string; description: string; qty: number; unitPrice: number }[];
}) {
  const [error, formAction, pending] = useActionState(createQuotationAction, undefined);

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
