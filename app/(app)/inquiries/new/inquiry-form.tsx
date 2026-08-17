"use client";

import { useActionState, useState } from "react";
import { createInquiryAction } from "@/app/actions/inquiries";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { CustomerPicker } from "@/components/customers/customer-picker";
import { ServicePicker } from "@/components/services/service-picker";
import { SpecFieldsEditor } from "@/components/services/spec-fields-editor";
import type { ServiceSearchResult } from "@/app/actions/services";

export function InquiryForm({ showCustomerPicker }: { showCustomerPicker?: boolean }) {
  const [error, formAction, pending] = useActionState(createInquiryAction, undefined);
  const [service, setService] = useState<ServiceSearchResult | null>(null);

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {showCustomerPicker && <CustomerPicker name="customerId" />}
      <ServicePicker name="serviceId" canAddService={showCustomerPicker} onSelect={setService} />
      {service && <SpecFieldsEditor name="specs" fields={service.specFields} />}
      <div>
        <Label htmlFor="roughQty">Rough quantity</Label>
        <Input id="roughQty" name="roughQty" type="number" min={1} placeholder="e.g. 25" />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" required rows={4} placeholder="Tell us what you need..." />
      </div>
      <Button type="submit" disabled={pending || !service}>
        {pending ? "Submitting..." : "Submit Inquiry"}
      </Button>
    </form>
  );
}
