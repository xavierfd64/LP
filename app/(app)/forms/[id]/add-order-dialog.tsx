"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { addOrderToFormAction, searchAttachableOrdersAction } from "@/app/actions/customer-form";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/utils";

type OrderResult = { id: string; orderNumber: string; status: string; totalAmount: string };

/** Attach an additional existing Order to this form (spec 7.2) — the form's own primary order is never replaced, only added to. */
export function AddOrderDialog({ formId }: { formId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrderResult[] | null>(null);
  const [selected, setSelected] = useState<OrderResult | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      searchAttachableOrdersAction(formId, query).then(setResults);
    }, 250);
    return () => clearTimeout(t);
  }, [open, query, formId]);

  async function handleSubmit() {
    if (!selected) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("orderId", selected.id);
    fd.set("note", note);
    const result = await addOrderToFormAction(formId, fd);
    setPending(false);
    if (result) {
      setError(result);
      return;
    }
    setOpen(false);
    setSelected(null);
    setQuery("");
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        + Add Order
      </Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader title="Add Order to this Form" subtitle="Attach another of this customer's existing orders — the original order stays unchanged." onClose={() => setOpen(false)} />
        <ModalBody>
          {error && <Alert tone="error">{error}</Alert>}
          {selected ? (
            <div className="flex items-center justify-between rounded-md border border-slate-300 bg-slate-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">{selected.orderNumber}</p>
                <p className="text-xs text-slate-500">
                  {selected.status} · {formatCurrency(selected.totalAmount)}
                </p>
              </div>
              <button type="button" className="text-xs text-slate-500 underline" onClick={() => setSelected(null)}>
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search order number..." className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="mt-1 max-h-48 space-y-1 overflow-y-auto">
                {results?.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">No other orders found for this customer.</p>}
                {results?.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelected(o)}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{o.orderNumber}</span>
                    <span className="text-xs text-slate-500">
                      {o.status} · {formatCurrency(o.totalAmount)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="add-order-note">Note (optional)</Label>
            <Textarea id="add-order-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending || !selected}>
            {pending ? "Adding..." : "Add Order"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
