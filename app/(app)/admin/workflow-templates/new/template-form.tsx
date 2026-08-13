"use client";

import { useActionState } from "react";
import { createWorkflowTemplateAction } from "@/app/actions/workflow-templates";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { StageEditor } from "../stage-editor";

export function NewTemplateForm() {
  const [error, formAction, pending] = useActionState(createWorkflowTemplateAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="name">Template name</Label>
        <Input id="name" name="name" required placeholder="e.g. Standee" />
      </div>
      <div>
        <Label>Stages (in order)</Label>
        <StageEditor initialStages={[]} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create Template"}
      </Button>
    </form>
  );
}
