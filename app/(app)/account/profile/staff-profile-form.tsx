"use client";

import { useActionState } from "react";
import { updateOwnStaffProfileAction } from "@/app/actions/self-profile";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

async function submit(_prevState: string | undefined, formData: FormData) {
  return updateOwnStaffProfileAction(formData);
}

/** Name/phone only — no role or permission field exists anywhere in this form, so there is no way to submit one (see app/actions/self-profile.ts). */
export function StaffProfileForm({ name, phone }: { name: string; phone: string | null }) {
  const [error, formAction, pending] = useActionState(submit, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="sp-name">Full Name</Label>
        <Input id="sp-name" name="name" required defaultValue={name} />
      </div>
      <div>
        <Label htmlFor="sp-phone">Phone Number</Label>
        <Input id="sp-phone" name="phone" defaultValue={phone ?? ""} placeholder="+639171234567" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
