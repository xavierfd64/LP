"use client";

import { Button } from "@/components/ui/button";
import { toggleServiceActiveAction } from "@/app/actions/services";

export function ToggleActiveButton({ serviceId, active }: { serviceId: string; active: boolean }) {
  return (
    <form action={toggleServiceActiveAction.bind(null, serviceId)}>
      <Button type="submit" size="sm" variant={active ? "destructive" : "outline"}>
        {active ? "Deactivate" : "Activate"}
      </Button>
    </form>
  );
}
