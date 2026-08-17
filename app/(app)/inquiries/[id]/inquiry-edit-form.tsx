"use client";

import { useActionState, useState } from "react";
import { updateInquiryAction } from "@/app/actions/inquiries";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ServicePicker } from "@/components/services/service-picker";
import { SpecFieldsEditor } from "@/components/services/spec-fields-editor";
import type { ServiceSearchResult } from "@/app/actions/services";

type Inquiry = {
  id: string;
  description: string;
  roughQty: number | null;
  specs: Record<string, string> | null;
  service: ServiceSearchResult | null;
};

export function InquiryEditForm({ inquiry }: { inquiry: Inquiry }) {
  const action = updateInquiryAction.bind(null, inquiry.id);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [open, setOpen] = useState(false);
  const [service, setService] = useState<ServiceSearchResult | null>(inquiry.service);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-slate-200 p-4">
      {error && <Alert tone="error">{error}</Alert>}
      <ServicePicker name="serviceId" initialService={inquiry.service} onSelect={setService} />
      {service && <SpecFieldsEditor name="specs" fields={service.specFields} initialSpecs={inquiry.specs} />}
      <div>
        <Label htmlFor="roughQty">Rough quantity</Label>
        <Input id="roughQty" name="roughQty" type="number" min={1} defaultValue={inquiry.roughQty ?? undefined} />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={4} defaultValue={inquiry.description} required />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !service}>
          {pending ? "Saving..." : "Save Changes"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
