"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  approveQuotationAction,
  rejectQuotationAction,
  updateQuotationForCustomerAction,
} from "@/app/actions/quotations";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EditorPanel } from "@/components/documents/editor-shell";
import { formatCurrency } from "@/lib/utils";

type LineItem = { id: string; productType: string; description: string; qty: number; unitPrice: number };

/**
 * The customer-facing action bar for a SENT quotation (spec Aug 19
 * corrective update, items 12/13/14/15/16) — Edit / Reject / Approve,
 * each with a confirmation step before anything irreversible happens.
 * Renders nothing once the quotation has moved past SENT (spec item 18):
 * the parent page only mounts this component while status === "SENT" in
 * the first place, so there's no separate "already decided" branch here.
 */
export function CustomerQuotationActions({
  quotationId,
  quoteNumber,
  lineItems,
  notes,
}: {
  quotationId: string;
  quoteNumber: string;
  lineItems: LineItem[];
  notes: string | null;
}) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject" | "edit">("idle");

  if (mode === "edit") {
    return <CustomerEditForm quotationId={quotationId} lineItems={lineItems} notes={notes} onClose={() => setMode("idle")} />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setMode("edit")}>
        Edit
      </Button>
      <Button variant="destructive" onClick={() => setMode("reject")}>
        Reject
      </Button>
      <Button onClick={() => setMode("approve")}>Approve</Button>

      {mode === "approve" && <ApproveDialog quotationId={quotationId} quoteNumber={quoteNumber} onClose={() => setMode("idle")} />}
      {mode === "reject" && <RejectDialog quotationId={quotationId} quoteNumber={quoteNumber} onClose={() => setMode("idle")} />}
    </div>
  );
}

function DialogShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function ApproveSubmitButton({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? "Approving…" : "Confirm Approval"}
      </Button>
    </>
  );
}

function ApproveDialog({ quotationId, quoteNumber, onClose }: { quotationId: string; quoteNumber: string; onClose: () => void }) {
  const action = approveQuotationAction.bind(null, quotationId);

  return (
    <DialogShell title="Approve Quotation?" onClose={onClose}>
      <p className="text-sm text-slate-600">
        By approving <span className="font-medium text-slate-900">{quoteNumber}</span>, you confirm that the quotation
        details and pricing are acceptable. This cannot be undone from here.
      </p>
      <form action={action} className="mt-4 flex justify-end gap-2">
        <ApproveSubmitButton onCancel={onClose} />
      </form>
    </DialogShell>
  );
}

function RejectDialog({ quotationId, quoteNumber, onClose }: { quotationId: string; quoteNumber: string; onClose: () => void }) {
  const action = rejectQuotationAction.bind(null, quotationId);
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <DialogShell title="Reject Quotation?" onClose={onClose}>
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-sm text-slate-600">
        Let us know why you&apos;re rejecting <span className="font-medium text-slate-900">{quoteNumber}</span> so our team
        can follow up.
      </p>
      <form action={formAction} className="mt-3 space-y-3">
        <Textarea name="reason" rows={3} required placeholder="Reason for rejection…" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "Rejecting…" : "Reject Quotation"}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

function CustomerEditForm({
  quotationId,
  lineItems,
  notes,
  onClose,
}: {
  quotationId: string;
  lineItems: LineItem[];
  notes: string | null;
  onClose: () => void;
}) {
  const action = updateQuotationForCustomerAction.bind(null, quotationId);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [rows, setRows] = useState(lineItems.map((li) => ({ ...li })));

  function updateRow(id: string, field: "description" | "qty", value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: field === "qty" ? Number(value) || 1 : value } : r)));
  }

  const estimatedTotal = rows.reduce((sum, r) => sum + r.qty * r.unitPrice, 0);

  return (
    <EditorPanel title="Edit Quotation">
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-xs text-slate-500">
        You can adjust quantity and description. Pricing is recalculated automatically — you can&apos;t set the price
        directly.
      </p>
      <form action={formAction} className="mt-3 space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-1 gap-2 rounded-md border border-slate-100 p-3 sm:grid-cols-12 sm:items-end">
            <input type="hidden" name="lineItemId" value={r.id} />
            <div className="sm:col-span-6">
              <Label>{r.productType}</Label>
              <Input name="description" value={r.description} onChange={(e) => updateRow(r.id, "description", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Quantity</Label>
              <Input name="qty" type="number" min={1} value={r.qty} onChange={(e) => updateRow(r.id, "qty", e.target.value)} />
            </div>
            <div className="sm:col-span-4 text-sm text-slate-500">
              Current: {formatCurrency(r.unitPrice)} / unit
            </div>
          </div>
        ))}
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={2} defaultValue={notes ?? ""} placeholder="Anything else we should know?" />
        </div>
        <p className="text-right text-sm text-slate-500">
          Estimated total (before final recalculation): <span className="font-semibold text-slate-900">{formatCurrency(estimatedTotal)}</span>
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </EditorPanel>
  );
}
