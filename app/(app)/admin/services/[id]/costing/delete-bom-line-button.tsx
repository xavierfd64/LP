"use client";

import { useState } from "react";
import { removeBOMMaterialAction, removeCostComponentAction } from "@/app/actions/service-costing";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/** Real confirmation dialog before removing a BOM line — using the shared Modal (Sept 9 — Unified Modal Design System). */
export function DeleteBomLineButton({ kind, id, label }: { kind: "material" | "component"; id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const action = kind === "material" ? removeBOMMaterialAction.bind(null, id) : removeCostComponentAction.bind(null, id);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-red-600 hover:underline">
        Remove
      </button>
      <Modal open={open} onClose={() => setOpen(false)} maxWidthClassName="max-w-sm">
        <ModalHeader title={`Remove ${kind === "material" ? "Material" : "Cost"}?`} onClose={() => setOpen(false)} />
        <form action={action}>
          <ModalBody>
            <p className="text-sm text-slate-600">
              Remove <span className="font-medium text-slate-900">{label}</span> from this service&apos;s production
              costing? This only affects future cost calculations — historical Orders keep their own cost snapshot.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive">
              Remove
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
