"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { deactivateStaffAction } from "@/app/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

/**
 * "Delete Staff" — deliberately a deactivation under the hood (see
 * deactivateStaffAction / assertSafeToDeactivate), not a row delete: this
 * account may already be referenced by quotations, orders, payments,
 * production assignments, and audit history, and none of that attribution
 * can be allowed to break. The button and dialog copy say "Delete"
 * because that's the Admin's mental model ("remove this person's
 * access") — what actually happens is exactly what the dialog says:
 * access is revoked, history stays intact.
 */
export function DeleteStaffDialog({
  staffId,
  staffName,
  staffEmail,
  onSuccess,
}: {
  staffId: string;
  staffName: string;
  staffEmail: string;
  onSuccess: () => void;
}) {
  const action = deactivateStaffAction.bind(null, staffId);
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
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Delete Staff
      </Button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-sm max-h-[85dvh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Delete Staff?</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {error && <Alert tone="error">{error}</Alert>}

              <p className="text-sm text-slate-600">You are about to remove this staff account:</p>
              <div className="mt-2 rounded-md border border-slate-100 bg-slate-50 p-3">
                <p className="font-medium text-slate-900">{staffName}</p>
                <p className="text-sm text-slate-500">{staffEmail}</p>
              </div>
              <p className="mt-3 text-sm text-slate-600">This action will prevent the staff member from accessing the system.</p>
              <p className="mt-1 text-sm text-slate-600">Historical transaction records will be preserved.</p>

              <form action={formAction} className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={pending}>
                  {pending ? "Deleting..." : "Delete Staff"}
                </Button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
