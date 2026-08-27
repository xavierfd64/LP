"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cancelPurchaseAction } from "@/app/actions/inventory";
import { Button } from "@/components/ui/button";

/** Real confirmation dialog, not window.confirm() — matching every other destructive action in this app. */
export function CancelPurchaseButton({ lotId, lotCode }: { lotId: string; lotCode: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-red-600 hover:underline">
        Cancel Purchase
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Cancel Purchase?</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-slate-600">
                This reverses the stock increase from purchase <span className="font-medium text-slate-900">{lotCode}</span> and
                marks it cancelled. The purchase record stays in history. This only works if nothing from it has been used yet.
              </p>
              <form action={cancelPurchaseAction.bind(null, lotId)} className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Keep It
                </Button>
                <Button type="submit" variant="destructive">
                  Cancel Purchase
                </Button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
