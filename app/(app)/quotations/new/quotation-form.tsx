"use client";

import { useActionState } from "react";
import { createQuotationAction } from "@/app/actions/quotations";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { LineItemsEditor, type LineItem } from "../line-items-editor";
import { CustomerPicker } from "@/components/customers/customer-picker";
import type { CustomerSearchResult } from "@/app/actions/customers";
import { EditorGrid, EditorPanel } from "@/components/documents/editor-shell";

export function QuotationForm({
  inquiryId,
  defaultCustomer,
  defaultLineItems,
}: {
  inquiryId?: string;
  defaultCustomer?: CustomerSearchResult | null;
  defaultLineItems?: LineItem[];
}) {
  const [error, formAction, pending] = useActionState(createQuotationAction, undefined);

  return (
    <form action={formAction} className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}
      {inquiryId && <input type="hidden" name="inquiryId" value={inquiryId} />}

      <EditorGrid>
        <EditorPanel title="Customer Information">
          <CustomerPicker name="customerId" initialCustomer={defaultCustomer} />
        </EditorPanel>

        <EditorPanel title="Document Information">
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
        </EditorPanel>
      </EditorGrid>

      <EditorPanel title="Line Items">
        <LineItemsEditor initialItems={defaultLineItems ?? []} />
      </EditorPanel>

      <EditorPanel title="Notes / Terms">
        <Textarea id="notes" name="notes" rows={2} placeholder="Optional notes for this quotation…" />
      </EditorPanel>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving..." : "Save as Draft"}
        </Button>
      </div>
    </form>
  );
}
