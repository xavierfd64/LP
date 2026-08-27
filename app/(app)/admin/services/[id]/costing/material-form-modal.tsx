"use client";

import { useActionState, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { addBOMMaterialAction, updateBOMMaterialAction } from "@/app/actions/service-costing";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";

type MaterialOption = { id: string; name: string; unit: string; averageUnitCost: number | null };
type Material = { id: string; inventoryItemId: string; consumptionPerUnit: number; wastePercent: number | null };

/** Add/Edit BOM Material — references an existing Inventory item, never a new material database (spec Part D item 6). */
export function MaterialFormModal({ serviceId, materials, material }: { serviceId: string; materials: MaterialOption[]; material?: Material }) {
  const [open, setOpen] = useState(false);
  const action = material ? updateBOMMaterialAction.bind(null, material.id) : addBOMMaterialAction.bind(null, serviceId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [inventoryItemId, setInventoryItemId] = useState(material?.inventoryItemId ?? "");
  const [consumption, setConsumption] = useState(material ? String(material.consumptionPerUnit) : "1");
  const [waste, setWaste] = useState(material?.wastePercent != null ? String(material.wastePercent) : "");

  const selected = materials.find((m) => m.id === inventoryItemId);
  const estimate = useMemo(() => {
    if (!selected || selected.averageUnitCost == null) return null;
    const qty = parseFloat(consumption);
    if (!isFinite(qty) || qty <= 0) return null;
    const wasteFraction = waste ? parseFloat(waste) / 100 : 0;
    return qty * (1 + wasteFraction) * selected.averageUnitCost;
  }, [selected, consumption, waste]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-brand-600 hover:underline">
        {material ? "Edit" : "+ Add Material"}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4">
            <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">{material ? "Edit Material Component" : "Add Material Component"}</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form action={formAction} className="space-y-3">
                {error && <Alert tone="error">{error}</Alert>}
                <div>
                  <Label htmlFor="inventoryItemId">Material *</Label>
                  <Select id="inventoryItemId" name="inventoryItemId" required value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)}>
                    <option value="" disabled>
                      Select…
                    </option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.unit}){m.averageUnitCost == null ? " — no cost data" : ""}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="consumptionPerUnit">Consumption per unit *</Label>
                    <Input
                      id="consumptionPerUnit"
                      name="consumptionPerUnit"
                      type="number"
                      min={0.0001}
                      step="0.0001"
                      required
                      value={consumption}
                      onChange={(e) => setConsumption(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-slate-400">{selected ? `${selected.unit} of material per 1 unit of service quantity` : "e.g. 1.00"}</p>
                  </div>
                  <div>
                    <Label htmlFor="wastePercent">Waste Allowance %</Label>
                    <Input id="wastePercent" name="wastePercent" type="number" min={0} max={100} step="0.01" value={waste} onChange={(e) => setWaste(e.target.value)} placeholder="Optional" />
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase text-slate-500">Cost Basis: Average Purchase Cost</p>
                  <p className="text-sm text-slate-600">
                    {selected?.averageUnitCost != null ? `${formatCurrency(selected.averageUnitCost)} / ${selected.unit} · Source: Inventory` : "Cost not configured for this material"}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{estimate != null ? `Estimated cost: ${formatCurrency(estimate)}` : "—"}</p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? "Saving…" : "Save Material"}
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
