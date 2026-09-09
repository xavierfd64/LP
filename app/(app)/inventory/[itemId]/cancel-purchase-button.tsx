"use client";

import { useState } from "react";
import { cancelPurchaseAction } from "@/app/actions/inventory";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/** Real confirmation dialog, not window.confirm() — using the shared Modal (Sept 9 — Unified Modal Design System). */
export function CancelPurchaseButton({ lotId, lotCode }: { lotId: string; lotCode: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-red-600 hover:underline">
        Cancel Purchase
      </button>
      <Modal open={open} onClose={() => setOpen(false)} maxWidthClassName="max-w-sm">
        <ModalHeader title="Cancel Purchase?" onClose={() => setOpen(false)} />
        <form action={cancelPurchaseAction.bind(null, lotId)}>
          <ModalBody>
            <p className="text-sm text-slate-600">
              This reverses the stock increase from purchase <span className="font-medium text-slate-900">{lotCode}</span> and
              marks it cancelled. The purchase record stays in history. This only works if nothing from it has been used yet.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Keep It
            </Button>
            <Button type="submit" variant="destructive">
              Cancel Purchase
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
