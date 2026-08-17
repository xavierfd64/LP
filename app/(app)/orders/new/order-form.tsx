"use client";

import { useActionState, useState } from "react";
import { createOrderAction } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { CustomerPicker } from "@/components/customers/customer-picker";
import type { CustomerSearchResult } from "@/app/actions/customers";
import { FormSection } from "@/components/documents/form-section";

export function OrderForm({
  quotationId,
  defaultCustomer,
  defaultTotal,
}: {
  quotationId?: string;
  defaultCustomer?: CustomerSearchResult | null;
  defaultTotal?: number;
}) {
  const [error, formAction, pending] = useActionState(createOrderAction, undefined);
  const [termType, setTermType] = useState<"STANDARD_PARTIAL" | "APPROVED_TERMS">("STANDARD_PARTIAL");

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {quotationId && <input type="hidden" name="quotationId" value={quotationId} />}

      <FormSection title="Customer Information">
        {defaultCustomer ? (
          <div>
            <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2">
              <p className="text-sm font-medium text-slate-900">
                {defaultCustomer.name}
                {defaultCustomer.companyName ? ` (${defaultCustomer.companyName})` : ""}
              </p>
              <p className="text-xs text-slate-500">{defaultCustomer.displayId} · locked from the source quotation</p>
            </div>
            <input type="hidden" name="customerId" value={defaultCustomer.id} />
          </div>
        ) : (
          <CustomerPicker name="customerId" />
        )}
      </FormSection>

      <FormSection title="Transaction Information">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="totalAmount">Total Amount (PHP)</Label>
            <Input id="totalAmount" name="totalAmount" type="number" min={0} step="0.01" required defaultValue={defaultTotal ?? 0} />
          </div>
          <div>
            <Label htmlFor="dueDate">Payment Due Date (optional)</Label>
            <Input id="dueDate" name="dueDate" type="date" />
            <p className="mt-1 text-xs text-slate-400">Drives Due/Overdue status on the Statement of Account.</p>
          </div>
          <div>
            <Label htmlFor="paymentTermType">Payment Terms</Label>
            <Select
              id="paymentTermType"
              name="paymentTermType"
              value={termType}
              onChange={(e) => setTermType(e.target.value as "STANDARD_PARTIAL" | "APPROVED_TERMS")}
            >
              <option value="STANDARD_PARTIAL">Standard — requires partial payment before production</option>
              <option value="APPROVED_TERMS">Approved Terms — qualified client exception</option>
            </Select>
          </div>

          {termType === "STANDARD_PARTIAL" && (
            <div>
              <Label htmlFor="requiredPartialPct">Required Partial Payment (%)</Label>
              <Input id="requiredPartialPct" name="requiredPartialPct" type="number" min={0} max={100} defaultValue={50} />
            </div>
          )}

          {termType === "APPROVED_TERMS" && (
            <>
              <div>
                <Label htmlFor="termsApprovedBy">Authorized By</Label>
                <Input id="termsApprovedBy" name="termsApprovedBy" required placeholder="Name of approving manager" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="termsReason">Reason</Label>
                <Textarea id="termsReason" name="termsReason" rows={2} placeholder="Why this client qualifies for terms" />
              </div>
            </>
          )}
        </div>
      </FormSection>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create Order"}
      </Button>
    </form>
  );
}
