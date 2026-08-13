"use client";

import { useActionState } from "react";
import { updateWorkflowTemplateAction } from "@/app/actions/workflow-templates";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { StageEditor, Stage } from "../stage-editor";

export function EditTemplateForm({
  templateId,
  name,
  stages,
}: {
  templateId: string;
  name: string;
  stages: Stage[];
}) {
  const [error, formAction, pending] = useActionState(updateWorkflowTemplateAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="templateId" value={templateId} />
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="name">Template name</Label>
        <Input id="name" name="name" required defaultValue={name} />
      </div>
      <div>
        <Label>Stages (in order)</Label>
        <StageEditor initialStages={stages} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
