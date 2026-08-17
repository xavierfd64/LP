"use client";

import { useActionState } from "react";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { saveEmailTemplateAction } from "@/app/actions/email-settings";

export function TemplateForm({ eventKey, subject, bodyHtml }: { eventKey: string; subject: string; bodyHtml: string }) {
  const action = saveEmailTemplateAction.bind(null, eventKey);
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" defaultValue={subject} required />
      </div>
      <div>
        <Label htmlFor="bodyHtml">Body</Label>
        <Textarea id="bodyHtml" name="bodyHtml" rows={10} defaultValue={bodyHtml} required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save Template"}
      </Button>
    </form>
  );
}
