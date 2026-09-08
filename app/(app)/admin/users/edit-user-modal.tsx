"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { updateUserAction } from "@/app/actions/admin-users";

export type EditableUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "ADMIN" | "STAFF" | "PRODUCTION" | "CUSTOMER";
  active: boolean;
};

const ROLE_OPTIONS = [
  { value: "CUSTOMER", label: "Customer" },
  { value: "STAFF", label: "Staff" },
  { value: "PRODUCTION", label: "Production" },
  { value: "ADMIN", label: "Admin" },
];

/**
 * General "Edit User" modal (Sept 8) — works for every role, unlike the
 * existing STAFF-only edit form on /admin/staff-permissions/[userId]
 * (updateStaffProfileAction), which stays untouched for that page. Role
 * is only actually editable when `canEditRole` (the viewer is an
 * Administrator) — rendered read-only otherwise so a Staff member with
 * USER_EDIT can never even attempt to submit a role change; the server
 * action enforces the same boundary regardless (spec: "must not elevate
 * permissions beyond what their role is authorized to manage").
 */
export function EditUserModal({ user, canEditRole }: { user: EditableUser; canEditRole: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await updateUserAction(user.id, formData);
    setPending(false);
    if (result) {
      setError(result);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" /> Edit
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} maxWidthClassName="max-w-lg">
        <ModalHeader title="Edit User" subtitle={user.email} onClose={() => setOpen(false)} />
        <form action={handleSubmit}>
          <ModalBody>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="eu-name">Full Name *</Label>
                <Input id="eu-name" name="name" required defaultValue={user.name} />
              </div>
              <div>
                <Label htmlFor="eu-email">Email Address *</Label>
                <Input id="eu-email" name="email" type="email" required defaultValue={user.email} />
              </div>
              <div>
                <Label htmlFor="eu-role">Role</Label>
                {canEditRole ? (
                  <Select id="eu-role" name="role" defaultValue={user.role}>
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input value={user.role} disabled readOnly title="Only an Administrator can change roles." />
                )}
              </div>
              <div>
                <Label htmlFor="eu-phone">Phone Number</Label>
                <Input id="eu-phone" name="phone" defaultValue={user.phone ?? ""} placeholder="+639171234567" />
              </div>
              <div>
                <Label htmlFor="eu-status">Status</Label>
                <Select id="eu-status" name="active" defaultValue={user.active ? "true" : "false"}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </Select>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
