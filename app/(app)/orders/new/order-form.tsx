"use client";

import { useActionState, useState } from "react";
import { createOrderAction } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type Customer = { id: string; name: string; companyName: string | null; isQualifiedForTerms: boolean };

export function OrderForm({
  customers,
  quotationId,
  defaultCustomerId,
  defaultTotal,
}: {
  customers: Customer[];
  quotationId?: string;
  defaultCustomerId?: string;
  defaultTotal?: number;
}) {
  const [error, formAction, pending] = useActionState(createOrderAction, undefined);
  const [termType, setTermType] = useState<"STANDARD_PARTIAL" | "APPROVED_TERMS">("STANDARD_PARTIAL");

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {quotationId && <input type="hidden" name="quotationId" value={quotationId} />}

      <div>
        <Label htmlFor="customerId">Customer</Label>
        <Select id="customerId" name="customerId" required defaultValue={defaultCustomerId ?? ""} disabled={!!defaultCustomerId}>
          <option value="">Select a customer...</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.companyName ? ` (${c.companyName})` : ""}
              {c.isQualifiedForTerms ? " — qualified for terms" : ""}
            </option>
          ))}
        </Select>
        {defaultCustomerId && <input type="hidden" name="customerId" value={defaultCustomerId} />}
      </div>

      <div>
        <Label htmlFor="totalAmount">Total amount (PHP)</Label>
        <Input id="totalAmount" name="totalAmount" type="number" min={0} step="0.01" required defaultValue={defaultTotal ?? 0} />
      </div>

      <div>
        <Label htmlFor="paymentTermType">Payment terms</Label>
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
          <Label htmlFor="requiredPartialPct">Required partial payment (%)</Label>
          <Input id="requiredPartialPct" name="requiredPartialPct" type="number" min={0} max={100} defaultValue={50} />
        </div>
      )}

      {termType === "APPROVED_TERMS" && (
        <>
          <div>
            <Label htmlFor="termsApprovedBy">Authorized by</Label>
            <Input id="termsApprovedBy" name="termsApprovedBy" required placeholder="Name of approving manager" />
          </div>
          <div>
            <Label htmlFor="termsReason">Reason</Label>
            <Textarea id="termsReason" name="termsReason" rows={2} placeholder="Why this client qualifies for terms" />
          </div>
        </>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create Order"}
      </Button>
    </form>
  );
}
