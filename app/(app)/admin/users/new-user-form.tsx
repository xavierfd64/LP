"use client";

import { useActionState, useState } from "react";
import { createUserAction } from "@/app/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function NewUserForm() {
  const [error, formAction, pending] = useActionState(createUserAction, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New User</Button>;
  }

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 items-end gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-5"
    >
      {error && (
        <div className="sm:col-span-2 lg:col-span-5">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div>
        <Label htmlFor="role">Role</Label>
        <Select id="role" name="role" defaultValue="STAFF">
          <option value="ADMIN">Admin</option>
          <option value="STAFF">Staff</option>
          <option value="PRODUCTION">Production</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="password">Temp password</Label>
        <Input id="password" name="password" type="text" minLength={6} required />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
