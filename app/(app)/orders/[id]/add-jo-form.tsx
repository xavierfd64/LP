"use client";

import { useActionState, useState } from "react";
import { createJobOrderAction } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ServicePicker } from "@/components/services/service-picker";
import { SpecFieldsEditor } from "@/components/services/spec-fields-editor";
import type { ServiceSearchResult } from "@/app/actions/services";
import { EditorPanel } from "@/components/documents/editor-shell";

type Template = { id: string; name: string };

export function AddJobOrderForm({
  orderId,
  templates,
  defaultService,
  defaultQuantity,
  defaultDescription,
  defaultSpecs,
}: {
  orderId: string;
  templates: Template[];
  defaultService?: ServiceSearchResult | null;
  defaultQuantity?: number;
  defaultDescription?: string;
  defaultSpecs?: Record<string, string> | null;
}) {
  const [error, formAction, pending] = useActionState(createJobOrderAction, undefined);
  const [open, setOpen] = useState(false);
  const [service, setService] = useState<ServiceSearchResult | null>(defaultService ?? null);
  // Prefilled from the selected Service's configured production flow (spec: "the
  // system automatically loads that service's production flow"), but staff can
  // still override it via the dropdown below.
  const [workflowTemplateId, setWorkflowTemplateId] = useState(defaultService?.workflowTemplateId ?? "");

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Add Job Order
      </Button>
    );
  }

  return (
    <EditorPanel title="Add Job Order">
      <form action={formAction} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      {error && <Alert tone="error">{error}</Alert>}
      <ServicePicker
        name="serviceId"
        initialService={defaultService}
        onSelect={(s) => {
          setService(s);
          if (s.workflowTemplateId) setWorkflowTemplateId(s.workflowTemplateId);
        }}
      />
      {service && service.specFields.length > 0 && (
        <SpecFieldsEditor name="specs" fields={service.specFields} initialSpecs={defaultSpecs} />
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="workflowTemplateId">Production flow</Label>
          <Select
            id="workflowTemplateId"
            name="workflowTemplateId"
            required
            value={workflowTemplateId}
            onChange={(e) => setWorkflowTemplateId(e.target.value)}
          >
            <option value="">Select...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="quantity">Quantity</Label>
          <Input id="quantity" name="quantity" type="number" min={1} required defaultValue={defaultQuantity} />
        </div>
        <div>
          <Label htmlFor="deadline">Deadline</Label>
          <Input id="deadline" name="deadline" type="date" />
        </div>
        <div>
          <Label htmlFor="priority">Priority</Label>
          <Select id="priority" name="priority" defaultValue="MEDIUM">
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} required defaultValue={defaultDescription} />
      </div>
      <div>
        <Label htmlFor="productionInstructions">Production Instructions (optional)</Label>
        <Textarea
          id="productionInstructions"
          name="productionInstructions"
          rows={2}
          placeholder="Notes for the production floor — materials, finishing, special handling…"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !service}>
          {pending ? "Adding..." : "Add Job Order"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      </form>
    </EditorPanel>
  );
}
