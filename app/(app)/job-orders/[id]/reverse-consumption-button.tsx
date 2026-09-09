"use client";

import { useState } from "react";
import { reverseConsumptionAction } from "@/app/actions/production-consumption";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/** Reverses one consumption record — restores inventory, keeps the original visible and flagged rather than deleted (spec item 33). Uses the shared Modal (Sept 9 — Unified Modal Design System). */
export function ReverseConsumptionButton({ consumptionId, materialName, actualQty, unit }: { consumptionId: string; materialName: string; actualQty: number; unit: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-red-600 hover:underline">
        Reverse
      </button>
      <Modal open={open} onClose={() => setOpen(false)} maxWidthClassName="max-w-sm">
        <ModalHeader title="Reverse Consumption?" onClose={() => setOpen(false)} />
        <form action={reverseConsumptionAction.bind(null, consumptionId)}>
          <ModalBody>
            <p className="text-sm text-slate-600">
              This restores <span className="font-medium text-slate-900">{actualQty} {unit}</span> of{" "}
              <span className="font-medium text-slate-900">{materialName}</span> back to inventory. The original record
              stays visible, marked reversed. Record a corrected consumption afterward if needed.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive">
              Reverse
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
