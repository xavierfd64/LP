"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { addFormItemsAction } from "@/app/actions/customer-form";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

type Row = { name: string; qty: number; notes: string };

/** Add Items to an existing form (spec 7.1) — appends new rows without touching any existing (especially printed) item. */
export function AddItemsDialog({ formId }: { formId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ name: "", qty: 1, notes: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("itemsJson", JSON.stringify(rows));
    const result = await addFormItemsAction(formId, fd);
    setPending(false);
    if (result) {
      setError(result);
      return;
    }
    setOpen(false);
    setRows([{ name: "", qty: 1, notes: "" }]);
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        + Add Items
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} maxWidthClassName="max-w-xl">
        <ModalHeader title="Add Items" subtitle="These items will be added to the existing form — nothing already submitted is changed." onClose={() => setOpen(false)} />
        <ModalBody>
          {error && <Alert tone="error">{error}</Alert>}
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-5">
                <Label>Name / Design</Label>
                <Input value={row.name} onChange={(e) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, name: e.target.value } : r)))} />
              </div>
              <div className="col-span-3">
                <Label>Qty</Label>
                <Input type="number" min={1} value={row.qty} onChange={(e) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, qty: Number(e.target.value) } : r)))} />
              </div>
              <div className="col-span-3">
                <Label>Notes</Label>
                <Input value={row.notes} onChange={(e) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, notes: e.target.value } : r)))} />
              </div>
              <button type="button" className="col-span-1 rounded p-2 text-red-500 disabled:opacity-30" disabled={rows.length === 1} onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, { name: "", qty: 1, notes: "" }])}>
            + Add Row
          </Button>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? "Adding..." : "Add Items"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
