"use client";

import { useActionState, useState } from "react";
import { reopenCustomerFormAction } from "@/app/actions/customer-form";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/** Admin/Staff-controlled reopen (spec 2.4) — a reason is required and recorded, and the reopen itself is a logged, notified event. */
export function ReopenFormDialog({ formId }: { formId: string }) {
  const [open, setOpen] = useState(false);
  const action = reopenCustomerFormAction.bind(null, formId);
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Reopen Form
      </Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader title="Reopen Customer Form" subtitle="The customer will be able to edit and resubmit. This is recorded in the form's history." onClose={() => setOpen(false)} />
        <form action={formAction}>
          <ModalBody>
            {error && <Alert tone="error">{error}</Alert>}
            <div>
              <Label htmlFor="reopen-reason">Reason for Reopening *</Label>
              <Textarea id="reopen-reason" name="reason" required rows={3} placeholder="Why does this form need to be edited again?" />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Reopening..." : "Reopen Form"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
