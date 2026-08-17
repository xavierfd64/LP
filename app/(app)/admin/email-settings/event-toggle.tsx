"use client";

import { Button } from "@/components/ui/button";
import { updateEmailEventSettingAction } from "@/app/actions/email-settings";

export function EventToggle({ eventKey, enabled }: { eventKey: string; enabled: boolean }) {
  const action = updateEmailEventSettingAction.bind(null, eventKey, !enabled);
  return (
    <form action={action}>
      <Button type="submit" size="sm" variant={enabled ? "outline" : "ghost"}>
        {enabled ? "ON" : "OFF"}
      </Button>
    </form>
  );
}
