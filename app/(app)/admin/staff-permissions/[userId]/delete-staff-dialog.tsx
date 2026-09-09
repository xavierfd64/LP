"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deactivateStaffAction } from "@/app/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * "Delete Staff" — deliberately a deactivation under the hood (see
 * deactivateStaffAction / assertSafeToDeactivate), not a row delete: this
 * account may already be referenced by quotations, orders, payments,
 * production assignments, and audit history, and none of that attribution
 * can be allowed to break. The button and dialog copy say "Delete"
 * because that's the Admin's mental model ("remove this person's
 * access") — what actually happens is exactly what the dialog says:
 * access is revoked, history stays intact. Uses the shared Modal (Sept 9
 * — Unified Modal Design System) rather than a hand-rolled portal overlay.
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
      <Modal open={open} onClose={() => setOpen(false)} maxWidthClassName="max-w-sm">
        <ModalHeader title="Delete Staff?" onClose={() => setOpen(false)} />
        <form action={formAction}>
          <ModalBody>
            {error && <Alert tone="error">{error}</Alert>}
            <p className="text-sm text-slate-600">You are about to remove this staff account:</p>
            <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
              <p className="font-medium text-slate-900">{staffName}</p>
              <p className="text-sm text-slate-500">{staffEmail}</p>
            </div>
            <p className="text-sm text-slate-600">This action will prevent the staff member from accessing the system.</p>
            <p className="text-sm text-slate-600">Historical transaction records will be preserved.</p>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Deleting..." : "Delete Staff"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
