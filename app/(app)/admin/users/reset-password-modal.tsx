"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { resetUserPasswordAction } from "@/app/actions/admin-users";

/**
 * Reset Password confirmation modal (Sept 8), matching the attached
 * illustration — target name/email, a clear explanation of what's about
 * to happen, then either "sent to email" or (email disabled) the
 * temporary password shown once for the admin to hand over directly.
 */
export function ResetPasswordModal({ userId, name, email }: { userId: string; name: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ emailed: boolean; tempPassword: string | null } | null>(null);

  function close() {
    setOpen(false);
    setError(null);
    const hadResult = !!result;
    setResult(null);
    if (hadResult) router.refresh();
  }

  async function handleReset() {
    setPending(true);
    setError(null);
    const res = await resetUserPasswordAction(userId);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult({ emailed: res.emailed, tempPassword: res.tempPassword });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <KeyRound className="h-3.5 w-3.5" /> Reset Password
      </Button>

      <Modal open={open} onClose={close} maxWidthClassName="max-w-md">
        <ModalHeader title="Reset Password" onClose={close} />
        <ModalBody>
          {error && <Alert tone="error">{error}</Alert>}
          {result ? (
            <div className="space-y-3">
              <Alert tone="success">
                {result.emailed
                  ? `A temporary password has been sent to ${email}.`
                  : "Email is currently disabled, so the temporary password is shown below — share it with the user directly."}
              </Alert>
              {result.tempPassword && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Temporary Password</p>
                  <p className="mt-1 font-mono text-base font-semibold text-slate-900">{result.tempPassword}</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Are you sure you want to reset the password for <span className="font-medium text-slate-900">{name}</span> (
                {email})?
              </p>
              <Alert tone="info">
                A temporary password will be generated and sent to the user&apos;s email. The user will be required to
                change this password upon next login.
              </Alert>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          {result ? (
            <Button type="button" onClick={close}>
              Close
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={handleReset} disabled={pending}>
                {pending ? "Resetting..." : "Reset Password"}
              </Button>
            </>
          )}
        </ModalFooter>
      </Modal>
    </>
  );
}
