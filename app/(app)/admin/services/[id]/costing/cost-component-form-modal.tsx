"use client";

import { useActionState, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { addCostComponentAction, updateCostComponentAction } from "@/app/actions/service-costing";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";

type Component = {
  id: string;
  category: "LABOR" | "MACHINE" | "FINISHING" | "OTHER";
  label: string;
  basis: "PER_UNIT" | "PER_HOUR" | "FLAT";
  rate: number;
  estimatedHours: number | null;
};

/** Add/Edit a Direct Production Cost — Labor, Machine/Electricity, Finishing, or Other (spec Part D items 13-16). */
export function CostComponentFormModal({ serviceId, component }: { serviceId: string; component?: Component }) {
  const [open, setOpen] = useState(false);
  const action = component ? updateCostComponentAction.bind(null, component.id) : addCostComponentAction.bind(null, serviceId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [basis, setBasis] = useState(component?.basis ?? "PER_UNIT");
  const [rate, setRate] = useState(component ? String(component.rate) : "");
  const [hours, setHours] = useState(component?.estimatedHours != null ? String(component.estimatedHours) : "");

  const preview = useMemo(() => {
    const r = parseFloat(rate);
    if (!isFinite(r) || r < 0) return null;
    if (basis === "FLAT") return `${formatCurrency(r)} per order, regardless of quantity`;
    if (basis === "PER_UNIT") return `${formatCurrency(r)} × quantity`;
    const h = parseFloat(hours);
    if (!isFinite(h) || h <= 0) return null;
    return `${h}h × ${formatCurrency(r)}/hr × quantity`;
  }, [basis, rate, hours]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-brand-600 hover:underline">
        {component ? "Edit" : "+ Add Cost"}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4">
            <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">{component ? "Edit Direct Production Cost" : "Add Direct Production Cost"}</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form action={formAction} className="space-y-3">
                {error && <Alert tone="error">{error}</Alert>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="category">Category *</Label>
                    <Select id="category" name="category" required defaultValue={component?.category ?? "LABOR"}>
                      <option value="LABOR">Labor</option>
                      <option value="MACHINE">Machine/Electricity</option>
                      <option value="FINISHING">Finishing</option>
                      <option value="OTHER">Other Direct Cost</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="label">Label *</Label>
                    <Input id="label" name="label" required maxLength={80} defaultValue={component?.label ?? ""} placeholder="e.g. Eyelets, Cutting, Standard Labor" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="basis">Cost Basis *</Label>
                  <Select id="basis" name="basis" required value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)}>
                    <option value="PER_UNIT">Per unit of quantity (e.g. ₱0.50/pc)</option>
                    <option value="PER_HOUR">Per hour × estimated time (e.g. ₱150/hr × 0.5hr)</option>
                    <option value="FLAT">Flat amount (regardless of quantity)</option>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="rate">{basis === "PER_HOUR" ? "Rate (₱/hour) *" : basis === "FLAT" ? "Flat Amount *" : "Rate (₱/unit) *"}</Label>
                    <Input id="rate" name="rate" type="number" min={0} step="0.0001" required value={rate} onChange={(e) => setRate(e.target.value)} />
                  </div>
                  {basis === "PER_HOUR" && (
                    <div>
                      <Label htmlFor="estimatedHours">Estimated Hours (per unit) *</Label>
                      <Input id="estimatedHours" name="estimatedHours" type="number" min={0.01} step="0.01" required value={hours} onChange={(e) => setHours(e.target.value)} />
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {preview ?? "Cost calculation incomplete."}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? "Saving…" : "Save Cost"}
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
