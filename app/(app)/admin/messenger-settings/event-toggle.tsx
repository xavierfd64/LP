"use client";

import { Button } from "@/components/ui/button";
import { updateMessengerEventSettingAction } from "@/app/actions/messenger-settings";
import type { MessengerCategory } from "@/lib/messenger-events";

export function EventToggle({ category, enabled }: { category: MessengerCategory; enabled: boolean }) {
  const action = updateMessengerEventSettingAction.bind(null, category, !enabled);
  return (
    <form action={action}>
      <Button type="submit" size="sm" variant={enabled ? "outline" : "ghost"}>
        {enabled ? "ON" : "OFF"}
      </Button>
    </form>
  );
}
