"use client";

import { Button } from "@/components/ui/button";
import { toggleMessengerMasterSwitchAction } from "@/app/actions/messenger-settings";

export function MasterSwitchToggle({ enabled }: { enabled: boolean }) {
  const action = toggleMessengerMasterSwitchAction.bind(null, !enabled);
  return (
    <form action={action}>
      <Button type="submit" variant={enabled ? "destructive" : "default"}>
        Turn {enabled ? "OFF" : "ON"}
      </Button>
    </form>
  );
}
