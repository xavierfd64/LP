"use client";

import { useFormStatus } from "react-dom";
import { setPluginActiveAction } from "@/app/actions/plugin";
import { Button } from "@/components/ui/button";

export function PluginToggleButton({ id, active }: { id: string; active: boolean }) {
  const action = setPluginActiveAction.bind(null, id, !active);
  return (
    <form action={action}>
      <SubmitButton active={active} />
    </form>
  );
}

function SubmitButton({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Working..." : active ? "Deactivate" : "Activate"}
    </Button>
  );
}
