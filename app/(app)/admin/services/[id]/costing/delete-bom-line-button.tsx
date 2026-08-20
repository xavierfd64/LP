"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { removeBOMMaterialAction, removeCostComponentAction } from "@/app/actions/service-costing";
import { Button } from "@/components/ui/button";

/** Real confirmation dialog before removing a BOM line — matches this app's established pattern for every other delete action. */
export function DeleteBomLineButton({ kind, id, label }: { kind: "material" | "component"; id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const action = kind === "material" ? removeBOMMaterialAction.bind(null, id) : removeCostComponentAction.bind(null, id);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-red-600 hover:underline">
        Remove
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Remove {kind === "material" ? "Material" : "Cost"}?</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-slate-600">
                Remove <span className="font-medium text-slate-900">{label}</span> from this service&apos;s production
                costing? This only affects future cost calculations — historical Orders keep their own cost snapshot.
              </p>
              <form action={action} className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive">
                  Remove
                </Button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
