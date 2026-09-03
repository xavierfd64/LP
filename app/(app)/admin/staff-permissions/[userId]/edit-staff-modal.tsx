"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { updateStaffProfileAction } from "@/app/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

/**
 * Edits an existing staff account's Name/Email/Contact/Password in place —
 * never their role or permissions (that stays on the Permissions form
 * below, untouched by this one). Same non-redirecting-action +
 * router.refresh() pattern already used by the Dashboard's Record Payment
 * popup: closes itself and the page updates immediately, no navigation.
 */
export function EditStaffModal({
  staffId,
  currentName,
  currentEmail,
  currentPhone,
  onSuccess,
}: {
  staffId: string;
  currentName: string;
  currentEmail: string;
  currentPhone: string | null;
  onSuccess: () => void;
}) {
  const action = updateStaffProfileAction.bind(null, staffId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [open, setOpen] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !error) {
      setOpen(false);
      onSuccess();
    }
    wasPending.current = pending;
  }, [pending, error, onSuccess]);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Edit Staff Account</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form action={formAction} className="space-y-3">
                {error && <Alert tone="error">{error}</Alert>}

                <div>
                  <Label htmlFor="es-name">Name</Label>
                  <Input id="es-name" name="name" required defaultValue={currentName} />
                </div>
                <div>
                  <Label htmlFor="es-email">Email</Label>
                  <Input id="es-email" name="email" type="email" required defaultValue={currentEmail} />
                </div>
                <div>
                  <Label htmlFor="es-phone">Contact Number</Label>
                  <Input id="es-phone" name="phone" defaultValue={currentPhone ?? ""} />
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs text-slate-500">
                    Leave both password fields blank to keep the current password unchanged.
                  </p>
                  <div>
                    <Label htmlFor="es-new-password">New Password</Label>
                    <Input id="es-new-password" name="newPassword" type="password" autoComplete="new-password" minLength={6} />
                  </div>
                  <div className="mt-3">
                    <Label htmlFor="es-confirm-password">Confirm New Password</Label>
                    <Input id="es-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={6} />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
