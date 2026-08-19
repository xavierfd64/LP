"use client";

import { useFormStatus } from "react-dom";
import { activateThemeAction } from "@/app/actions/theme";
import { Button } from "@/components/ui/button";

export function ActivateThemeButton({ slug, name }: { slug: string; name: string }) {
  const action = activateThemeAction.bind(null, slug);
  return (
    <form action={action}>
      <SubmitButton name={name} />
    </form>
  );
}

function SubmitButton({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Activating..." : `Activate ${name}`}
    </Button>
  );
}
