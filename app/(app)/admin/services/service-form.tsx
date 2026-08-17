"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { createServiceAction, updateServiceAction } from "@/app/actions/services";

type Template = { id: string; name: string };
type Service = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  workflowTemplateId: string | null;
  specFields: string[];
};

export function ServiceForm({ templates, service }: { templates: Template[]; service?: Service }) {
  const action = service ? updateServiceAction.bind(null, service.id) : createServiceAction;
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="name">Service Name *</Label>
        <Input id="name" name="name" required defaultValue={service?.name ?? ""} />
      </div>
      <div>
        <Label htmlFor="category">Category</Label>
        <Input id="category" name="category" defaultValue={service?.category ?? ""} placeholder="e.g. Apparel, Signage & Printing" />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={3} defaultValue={service?.description ?? ""} />
      </div>
      <div>
        <Label htmlFor="workflowTemplateId">Production Flow</Label>
        <Select id="workflowTemplateId" name="workflowTemplateId" defaultValue={service?.workflowTemplateId ?? ""}>
          <option value="">Not assigned yet</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-slate-400">
          Job Orders created for this Service automatically use this flow.{" "}
          <Link href="/admin/workflow-templates/new" className="underline">
            Create a new production flow
          </Link>
          .
        </p>
      </div>
      <div>
        <Label htmlFor="specFields">Spec Fields (comma-separated)</Label>
        <Input
          id="specFields"
          name="specFields"
          defaultValue={service?.specFields.join(", ") ?? ""}
          placeholder="e.g. Width, Height, Material, Finishing"
        />
        <p className="mt-1 text-xs text-slate-400">
          Shown as optional fields wherever this Service is selected in Inquiry/Quotation/Job Order forms.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : service ? "Save Changes" : "Create Service"}
      </Button>
    </form>
  );
}
