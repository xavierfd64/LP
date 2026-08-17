"use client";

import { useActionState } from "react";
import { editCustomerAction } from "@/app/actions/customers";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type Customer = {
  id: string;
  name: string;
  companyName: string | null;
  address: string | null;
  email: string | null;
  contactNumber: string | null;
  facebookUrl: string | null;
};

export function EditCustomerForm({ customer }: { customer: Customer }) {
  const action = editCustomerAction.bind(null, customer.id);
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="name">Complete Name</Label>
        <Input id="name" name="name" required defaultValue={customer.name} />
      </div>
      <div>
        <Label htmlFor="companyName">Company (optional)</Label>
        <Input id="companyName" name="companyName" defaultValue={customer.companyName ?? ""} />
      </div>
      <div>
        <Label htmlFor="address">Address</Label>
        <Textarea id="address" name="address" rows={2} defaultValue={customer.address ?? ""} />
      </div>
      <div>
        <Label htmlFor="contactNumber">Contact Number</Label>
        <Input id="contactNumber" name="contactNumber" defaultValue={customer.contactNumber ?? ""} />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={customer.email ?? ""} />
      </div>
      <div>
        <Label htmlFor="facebookUrl">Facebook</Label>
        <Input id="facebookUrl" name="facebookUrl" defaultValue={customer.facebookUrl ?? ""} />
      </div>
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Saving…" : "Save Changes"}
      </Button>
    </form>
  );
}
