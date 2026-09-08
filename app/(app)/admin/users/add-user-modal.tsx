"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { createUserAction } from "@/app/actions/admin-users";

const ROLE_OPTIONS = [
  { value: "CUSTOMER", label: "Customer" },
  { value: "STAFF", label: "Staff" },
  { value: "PRODUCTION", label: "Production" },
  { value: "ADMIN", label: "Admin" },
];

/**
 * Replaces the old cramped inline "New User" form (Sept 8 — User
 * Management/Password Reset/Login Security improvement) with a proper
 * modal, following the attached illustration. The temporary password is
 * always generated server-side (createUserAction) — this form never
 * collects one from the admin.
 */
export function AddUserModal({ canCreateAdmin }: { canCreateAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ emailed: boolean; tempPassword: string | null; email: string } | null>(null);

  function close() {
    setOpen(false);
    setError(null);
    setResult(null);
    if (result) router.refresh();
  }

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const email = String(formData.get("email") ?? "");
    const res = await createUserAction(formData);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult({ emailed: res.emailed, tempPassword: res.tempPassword, email });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Add User</Button>

      <Modal open={open} onClose={close} maxWidthClassName="max-w-lg">
        <ModalHeader title={result ? "User Created" : "Add New User"} onClose={close} />
        {result ? (
          <>
            <ModalBody>
              <div className="space-y-3">
                <Alert tone="success">
                  {result.emailed
                    ? `A temporary password has been sent to ${result.email}.`
                    : "Account created. Email is currently disabled, so the temporary password is shown below — share it with the user directly."}
                </Alert>
                {result.tempPassword && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Temporary Password</p>
                    <p className="mt-1 font-mono text-base font-semibold text-slate-900">{result.tempPassword}</p>
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  The user will be required to change this password the next time they log in.
                </p>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" onClick={close}>
                Close
              </Button>
            </ModalFooter>
          </>
        ) : (
          <form action={handleSubmit}>
            <ModalBody>
              {error && <Alert tone="error">{error}</Alert>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="au-name">Full Name *</Label>
                  <Input id="au-name" name="name" required placeholder="Juan Dela Cruz" />
                </div>
                <div>
                  <Label htmlFor="au-email">Email Address *</Label>
                  <Input id="au-email" name="email" type="email" required placeholder="juan@example.com" />
                </div>
                <div>
                  <Label htmlFor="au-role">Role *</Label>
                  <Select id="au-role" name="role" defaultValue="CUSTOMER">
                    {ROLE_OPTIONS.filter((r) => r.value !== "ADMIN" || canCreateAdmin).map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="au-phone">Phone Number</Label>
                  <Input id="au-phone" name="phone" placeholder="+639171234567" />
                </div>
                <div>
                  <Label htmlFor="au-status">Status</Label>
                  <Select id="au-status" name="active" defaultValue="true">
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input id="au-send-email" name="sendEmail" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300" />
                  <Label htmlFor="au-send-email" className="mb-0">
                    Send account details to email
                  </Label>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                An email with the temporary password will be sent. The user must change it on first login.
              </p>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating..." : "Create User"}
              </Button>
            </ModalFooter>
          </form>
        )}
      </Modal>
    </>
  );
}
