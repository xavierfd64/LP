"use client";

import { Button } from "@/components/ui/button";
import { toggleEmailMasterSwitchAction } from "@/app/actions/email-settings";

export function MasterSwitchToggle({ enabled }: { enabled: boolean }) {
  const action = toggleEmailMasterSwitchAction.bind(null, !enabled);
  return (
    <form action={action}>
      <Button type="submit" variant={enabled ? "destructive" : "default"}>
        Turn {enabled ? "OFF" : "ON"}
      </Button>
    </form>
  );
}
