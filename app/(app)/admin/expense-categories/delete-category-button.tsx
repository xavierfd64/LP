"use client";

import { useState } from "react";
import { deleteExpenseCategoryAction } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Only ever rendered for a category with zero linked expenses (the
 * calling page checks `_count.expenses === 0` before showing this button
 * at all) — the server action re-checks the same rule, so a category with
 * history can never be destroyed even if a stale page were somehow
 * submitted (spec Part B item 6). Uses the shared Modal (Sept 9 — Unified
 * Modal Design System) rather than a hand-rolled portal overlay.
 */
export function DeleteCategoryButton({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-red-600 hover:underline">
        Delete
      </button>
      <Modal open={open} onClose={() => setOpen(false)} maxWidthClassName="max-w-sm">
        <ModalHeader title="Delete Category?" onClose={() => setOpen(false)} />
        <form action={deleteExpenseCategoryAction.bind(null, categoryId)}>
          <ModalBody>
            <p className="text-sm text-slate-600">
              Are you sure you want to permanently delete <span className="font-medium text-slate-900">{categoryName}</span>? It has
              never been used on an expense record, so this cannot be undone. If you might use it later, Deactivate it instead.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive">
              Delete
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
