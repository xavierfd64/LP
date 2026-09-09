"use client";

import { useState } from "react";
import { voidExpenseAction } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Voiding must not happen silently (spec item 6, extended by security
 * hardening pass #2's void-not-delete fix) — a real confirmation dialog,
 * not window.confirm(), using the shared Modal (Sept 9 — Unified Modal
 * Design System) rather than a hand-rolled portal overlay.
 */
export function VoidExpenseButton({ expenseId, expenseNumber }: { expenseId: string; expenseNumber: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-red-600 hover:underline">
        Void
      </button>
      <Modal open={open} onClose={() => setOpen(false)} maxWidthClassName="max-w-sm">
        <ModalHeader title="Void Expense?" onClose={() => setOpen(false)} />
        <form action={voidExpenseAction.bind(null, expenseId)}>
          <ModalBody>
            <p className="text-sm text-slate-600">
              Are you sure you want to void <span className="font-medium text-slate-900">{expenseNumber}</span>? It will be
              removed from financial totals but stays visible in this list for the record. This cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive">
              Void
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
