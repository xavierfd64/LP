"use client";

import { useActionState, useState } from "react";
import { activateCustomerLoginAction } from "@/app/actions/customers";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function ActivateLoginForm({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const action = activateCustomerLoginAction.bind(null, customerId);
  const [error, formAction, pending] = useActionState(action, undefined);

  if (!open) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-500">
          This customer has no login account yet. Activating a login links it to this exact record — no new
          Customer Record is created, and all prior transactions stay attached.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          Activate Login
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="al-email">Login Email</Label>
        <Input id="al-email" name="email" type="email" required />
      </div>
      <div>
        <Label htmlFor="al-password">Temporary Password</Label>
        <Input id="al-password" name="password" type="password" required minLength={6} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Activating…" : "Activate Login"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
