"use client";

import { useActionState } from "react";
import { createInquiryAction } from "@/app/actions/inquiries";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type Customer = { id: string; name: string; companyName: string | null };

export function InquiryForm({ customers }: { customers?: Customer[] }) {
  const [error, formAction, pending] = useActionState(createInquiryAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {customers && (
        <div>
          <Label htmlFor="customerId">Customer</Label>
          <Select id="customerId" name="customerId" required>
            <option value="">Select a customer...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.companyName ? ` (${c.companyName})` : ""}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div>
        <Label htmlFor="desiredProduct">Product type</Label>
        <Input id="desiredProduct" name="desiredProduct" required placeholder="e.g. Jersey, Tarpaulin, Signage" />
      </div>
      <div>
        <Label htmlFor="roughQty">Rough quantity</Label>
        <Input id="roughQty" name="roughQty" type="number" min={1} placeholder="e.g. 25" />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" required rows={4} placeholder="Tell us what you need..." />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting..." : "Submit Inquiry"}
      </Button>
    </form>
  );
}
