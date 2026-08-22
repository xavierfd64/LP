"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createInquiryAction } from "@/app/actions/inquiries";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ServicePicker } from "@/components/services/service-picker";
import { SpecFieldsEditor } from "@/components/services/spec-fields-editor";
import type { ServiceSearchResult } from "@/app/actions/services";
import { FormSectionCard } from "@/components/documents/form-section-card";

export function InquiryForm({
  customer,
}: {
  customer: { name: string; email: string | null; contactNumber: string | null; displayId: string };
}) {
  const [error, formAction, pending] = useActionState(createInquiryAction, undefined);
  const [service, setService] = useState<ServiceSearchResult | null>(null);

  return (
    <form action={formAction} className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}

      <FormSectionCard number={1} title="Customer Information" tone="purple">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-sm font-medium text-slate-900">{customer.name}</p>
          <p className="text-xs text-slate-500">
            {customer.displayId}
            {customer.contactNumber ? ` · ${customer.contactNumber}` : ""}
            {customer.email ? ` · ${customer.email}` : ""}
          </p>
        </div>
      </FormSectionCard>

      <FormSectionCard number={2} title="Service / Product" tone="purple">
        <ServicePicker name="serviceId" canAddService={false} onSelect={setService} />
      </FormSectionCard>

      <FormSectionCard number={3} title="Requirements" tone="purple">
        <div className="space-y-4">
          {service && <SpecFieldsEditor name="specs" fields={service.specFields} />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="roughQty">Rough Quantity</Label>
              <Input id="roughQty" name="roughQty" type="number" min={1} placeholder="e.g. 25" />
            </div>
            <div>
              <Label htmlFor="roughQtyUnit">Unit (optional)</Label>
              <Input id="roughQtyUnit" name="roughQtyUnit" placeholder="e.g. pcs, sets, sqm, boxes" />
            </div>
          </div>
          <div>
            <Label htmlFor="description">Description / Details</Label>
            <Textarea
              id="description"
              name="description"
              required
              rows={5}
              maxLength={1000}
              placeholder="Tell us what you need — preferred size, color, material, design, or other details..."
            />
          </div>
        </div>
      </FormSectionCard>

      <FormSectionCard number={4} title="Summary" tone="green">
        <Alert tone="info">This inquiry will be reviewed by our team and a quotation will be provided.</Alert>
      </FormSectionCard>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="lg" disabled={pending || !service}>
          {pending ? "Submitting..." : "Submit Inquiry"}
        </Button>
        <Link href="/inquiries">
          <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}
