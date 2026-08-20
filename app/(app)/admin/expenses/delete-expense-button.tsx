"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { deleteExpenseAction } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";

/**
 * Deletion must not happen silently (spec item 6) — a real confirmation
 * dialog, not window.confirm(), matching this app's established pattern
 * for every other irreversible action (CancelQuotationForm, the Reject
 * Quotation dialog, etc).
 */
export function DeleteExpenseButton({ expenseId, expenseNumber }: { expenseId: string; expenseNumber: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-red-600 hover:underline">
        Delete
      </button>
      {open && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Delete Expense?</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-slate-600">
                Are you sure you want to delete <span className="font-medium text-slate-900">{expenseNumber}</span>? This cannot be undone.
              </p>
              <form action={deleteExpenseAction.bind(null, expenseId)} className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive">
                  Delete
                </Button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
