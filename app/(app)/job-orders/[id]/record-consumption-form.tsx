"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { recordConsumptionAction } from "@/app/actions/production-consumption";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

/**
 * Records actual material consumption for one BOM material against this
 * Job Order (spec Part 5 item 7). Pre-filled with the material and its
 * BOM-expected quantity — never a generic "pick any material" form, since
 * this is meant to reconcile against what the BOM already expects.
 */
export function RecordConsumptionForm({
  jobOrderId,
  inventoryItemId,
  materialName,
  unit,
  expectedQty,
  availableQty,
}: {
  jobOrderId: string;
  inventoryItemId: string;
  materialName: string;
  unit: string;
  expectedQty: number | null;
  availableQty: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, formAction, pending] = useActionState(recordConsumptionAction, undefined);
  const [actualQty, setActualQty] = useState(expectedQty != null ? String(expectedQty) : "");
  const insufficient = actualQty !== "" && parseFloat(actualQty) > availableQty;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Record Consumption
      </Button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Record Material Consumption</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form action={formAction} className="space-y-3">
                <input type="hidden" name="jobOrderId" value={jobOrderId} />
                <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
                {error && <Alert tone="error">{error}</Alert>}

                <div>
                  <p className="text-xs uppercase text-slate-500">Material</p>
                  <p className="font-medium text-slate-900">{materialName}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs uppercase text-slate-500">Expected</p>
                    <p className="text-slate-700">{expectedQty != null ? `${expectedQty} ${unit}` : "Not on BOM"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Available</p>
                    <p className="text-slate-700">{availableQty} {unit}</p>
                  </div>
                </div>

                <div>
                  <Label htmlFor="actualQty">Actual Used ({unit}) *</Label>
                  <Input id="actualQty" name="actualQty" type="number" min={0.0001} step="0.0001" required value={actualQty} onChange={(e) => setActualQty(e.target.value)} />
                </div>

                {insufficient && (
                  <Alert tone="warning">
                    Insufficient inventory — only {availableQty} {unit} available. Check the box below to record this as an
                    approved shortage (a reason is required).
                    <label className="mt-2 flex items-center gap-2 text-sm font-normal">
                      <input type="checkbox" name="allowShortage" value="true" />
                      Record as an approved shortage
                    </label>
                  </Alert>
                )}

                <div>
                  <Label htmlFor="varianceReason">Reason for Variance</Label>
                  <Input id="varianceReason" name="varianceReason" maxLength={200} placeholder="e.g. Additional material required, reprint" />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" rows={2} maxLength={500} placeholder="Optional" />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? "Saving…" : "Record Consumption"}
                  </Button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
