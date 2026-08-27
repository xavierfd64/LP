"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { createSupplierAction, updateSupplierAction } from "@/app/actions/suppliers";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type Supplier = {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  paymentTerms: string | null;
  notes: string | null;
  active: boolean;
};

/** One modal, two modes — same create/edit-share pattern as CategoryFormModal (Aug 20 2nd update). */
export function SupplierFormModal({ supplier, trigger }: { supplier?: Supplier; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const action = supplier ? updateSupplierAction.bind(null, supplier.id) : createSupplierAction;
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : supplier ? (
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          Edit Supplier
        </Button>
      ) : (
        <Button type="button" onClick={() => setOpen(true)}>
          + Add Supplier
        </Button>
      )}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4">
            <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">{supplier ? "Edit Supplier" : "Add Supplier"}</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form action={formAction} className="space-y-3">
                {error && <Alert tone="error">{error}</Alert>}
                <div>
                  <Label htmlFor="sup-name">Supplier Name *</Label>
                  <Input id="sup-name" name="name" required maxLength={120} defaultValue={supplier?.name ?? ""} placeholder="e.g. ABC Tarpaulin Supply" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="sup-contact">Contact Person</Label>
                    <Input id="sup-contact" name="contactPerson" defaultValue={supplier?.contactPerson ?? ""} placeholder="e.g. Juan Santos" />
                  </div>
                  <div>
                    <Label htmlFor="sup-phone">Phone</Label>
                    <Input id="sup-phone" name="phone" defaultValue={supplier?.phone ?? ""} placeholder="e.g. 0917-123-4567" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="sup-email">Email</Label>
                  <Input id="sup-email" name="email" type="email" defaultValue={supplier?.email ?? ""} />
                </div>
                <div>
                  <Label htmlFor="sup-address">Address</Label>
                  <Textarea id="sup-address" name="address" rows={2} defaultValue={supplier?.address ?? ""} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="sup-taxid">Tax / VAT ID</Label>
                    <Input id="sup-taxid" name="taxId" defaultValue={supplier?.taxId ?? ""} placeholder="Optional" />
                  </div>
                  <div>
                    <Label htmlFor="sup-terms">Payment Terms</Label>
                    <Input id="sup-terms" name="paymentTerms" defaultValue={supplier?.paymentTerms ?? ""} placeholder="e.g. Net 30" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="sup-notes">Notes</Label>
                  <Textarea id="sup-notes" name="notes" rows={2} defaultValue={supplier?.notes ?? ""} placeholder="Optional" />
                </div>
                <div>
                  <Label htmlFor="sup-active">Status</Label>
                  <Select id="sup-active" name="active" defaultValue={supplier ? String(supplier.active) : "true"}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? "Saving…" : "Save Supplier"}
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
