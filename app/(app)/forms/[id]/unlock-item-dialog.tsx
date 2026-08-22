"use client";

import { useActionState, useState } from "react";
import { unlockPrintedItemAction } from "@/app/actions/customer-form";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/** Admin-only (or FORM_ITEM_UNLOCK_OVERRIDE) exceptional override of a printed item's lock (spec 6/11) — always requires and records a reason. */
export function UnlockItemDialog({ itemId, itemName }: { itemId: string; itemName: string }) {
  const [open, setOpen] = useState(false);
  const action = unlockPrintedItemAction.bind(null, itemId);
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Override Lock
      </Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader title="Override Printed Item Lock" subtitle={`"${itemName}" was already marked printed. This is an exceptional action.`} onClose={() => setOpen(false)} />
        <form action={formAction}>
          <ModalBody>
            {error && <Alert tone="error">{error}</Alert>}
            <Alert tone="warning">This unlocks a printed, production-recorded item for editing. Use only when the business explicitly allows it.</Alert>
            <div>
              <Label htmlFor="unlock-reason">Reason *</Label>
              <Textarea id="unlock-reason" name="reason" required rows={3} placeholder="Why does this printed item need to be unlocked?" />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Unlocking..." : "Override & Unlock"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
