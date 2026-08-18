"use client";

import { useActionState } from "react";
import { updateOwnProfileAction } from "@/app/actions/customer-profile";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function ProfileForm({
  name,
  companyName,
  email,
  contactNumber,
  address,
  facebookUrl,
}: {
  name: string;
  companyName: string | null;
  email: string | null;
  contactNumber: string | null;
  address: string | null;
  facebookUrl: string | null;
}) {
  const [message, formAction, pending] = useActionState(updateOwnProfileAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {message && <Alert tone={message === "Profile updated." ? "success" : "error"}>{message}</Alert>}
      <div>
        <Label htmlFor="name">Full Name</Label>
        <Input id="name" name="name" defaultValue={name} required />
      </div>
      <div>
        <Label htmlFor="companyName">Company</Label>
        <Input id="companyName" name="companyName" defaultValue={companyName ?? ""} placeholder="Optional" />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={email ?? ""} placeholder="Contact email for quotations and updates" />
      </div>
      <div>
        <Label htmlFor="contactNumber">Contact Number</Label>
        <Input id="contactNumber" name="contactNumber" defaultValue={contactNumber ?? ""} placeholder="0917-000-0000" />
      </div>
      <div>
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" defaultValue={address ?? ""} placeholder="Optional" />
      </div>
      <div>
        <Label htmlFor="facebookUrl">Facebook</Label>
        <Input id="facebookUrl" name="facebookUrl" defaultValue={facebookUrl ?? ""} placeholder="facebook.com/yourprofile" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
