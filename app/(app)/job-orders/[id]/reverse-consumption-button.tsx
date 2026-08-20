"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { reverseConsumptionAction } from "@/app/actions/production-consumption";
import { Button } from "@/components/ui/button";

/** Reverses one consumption record — restores inventory, keeps the original visible and flagged rather than deleted (spec item 33). */
export function ReverseConsumptionButton({ consumptionId, materialName, actualQty, unit }: { consumptionId: string; materialName: string; actualQty: number; unit: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-red-600 hover:underline">
        Reverse
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Reverse Consumption?</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-slate-600">
                This restores <span className="font-medium text-slate-900">{actualQty} {unit}</span> of{" "}
                <span className="font-medium text-slate-900">{materialName}</span> back to inventory. The original record
                stays visible, marked reversed. Record a corrected consumption afterward if needed.
              </p>
              <form action={reverseConsumptionAction.bind(null, consumptionId)} className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive">
                  Reverse
                </Button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
