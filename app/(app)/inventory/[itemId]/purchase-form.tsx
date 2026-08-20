"use client";

import { useActionState, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import { recordPurchaseAction } from "@/app/actions/inventory";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";

type SupplierOpt = { id: string; name: string };

/**
 * Recording a purchase IS receiving a supply lot (see recordPurchaseAction's
 * doc comment) — this replaces the 1st-generation ReceiveLotForm with the
 * full form spec Part C item 7 describes: real Supplier, cost, invoice,
 * and a live Quantity x Unit Cost = Total Cost preview (item 8) computed
 * client-side, never trusting a typed total.
 */
export function PurchaseForm({ itemId, unit, suppliers }: { itemId: string; unit: string; suppliers: SupplierOpt[] }) {
  const [open, setOpen] = useState(false);
  const [error, formAction, pending] = useActionState(recordPurchaseAction, undefined);
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");

  const total = useMemo(() => {
    const q = parseFloat(qty);
    const c = parseFloat(unitCost);
    if (!isFinite(q) || !isFinite(c) || q <= 0 || c < 0) return null;
    return q * c;
  }, [qty, unitCost]);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Record Material Purchase
      </Button>
    );
  }

  return (
    <>
      {typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4">
            <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Record Material Purchase</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {suppliers.length === 0 ? (
                <Alert tone="warning">
                  No active suppliers yet.{" "}
                  <Link href="/inventory/suppliers" className="underline">
                    Add a supplier
                  </Link>{" "}
                  before recording a purchase.
                </Alert>
              ) : (
                <form action={formAction} className="space-y-3">
                  <input type="hidden" name="itemId" value={itemId} />
                  {error && <Alert tone="error">{error}</Alert>}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="purchaseDate">Purchase Date</Label>
                      <Input id="purchaseDate" name="purchaseDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                    </div>
                    <div>
                      <Label htmlFor="supplierId">Supplier *</Label>
                      <Select id="supplierId" name="supplierId" required defaultValue="">
                        <option value="" disabled>
                          Select…
                        </option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="invoiceNumber">Invoice / OR Number</Label>
                    <Input id="invoiceNumber" name="invoiceNumber" placeholder="Optional" />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="quantity">Quantity ({unit}) *</Label>
                      <Input id="quantity" name="quantity" type="number" min={1} step={1} required value={qty} onChange={(e) => setQty(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="unitCost">Unit Cost</Label>
                      <Input
                        id="unitCost"
                        name="unitCost"
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Optional — leave blank if unknown"
                        value={unitCost}
                        onChange={(e) => setUnitCost(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs uppercase text-slate-500">Total Cost</p>
                    <p className="text-lg font-semibold text-slate-900">{total != null ? formatCurrency(total) : "—"}</p>
                  </div>
                  <div>
                    <Label htmlFor="paymentMethod">Payment Method</Label>
                    <Select id="paymentMethod" name="paymentMethod" defaultValue="">
                      <option value="">Not specified</option>
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="GCASH">GCash</option>
                      <option value="MAYA">Maya</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="OTHER">Other</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="referenceNumber">Reference Number</Label>
                    <Input id="referenceNumber" name="referenceNumber" placeholder="Optional" />
                  </div>
                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea id="notes" name="notes" rows={2} placeholder="Optional" />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={pending}>
                      {pending ? "Saving…" : "Record Purchase"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
