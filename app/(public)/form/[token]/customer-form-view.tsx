"use client";

import { useActionState, useMemo, useState } from "react";
import { Trash2, Clock, PenLine, Save, ShieldCheck, HelpCircle, CheckCircle2, Bell, Lock } from "lucide-react";
import { BrandLogo } from "@/components/branding/brand-logo";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/utils";
import { saveCustomerFormDraftAction, submitCustomerFormAction } from "@/app/actions/public-customer-form";

type ItemDraft = { id?: string; name: string; qty: number; notes: string; specs: Record<string, string>; printed: boolean };

function emptyItem(): ItemDraft {
  return { name: "", qty: 1, notes: "", specs: {}, printed: false };
}

export function CustomerFormView({
  token,
  business,
  form,
  specFields,
  items: initialItems,
}: {
  token: string;
  business: { name: string; tagline: string | null; logoPath: string | null; address: string | null; contactNumber: string | null; email: string | null };
  form: {
    id: string;
    title: string;
    instructions: string | null;
    status: "OPEN" | "SUBMITTED";
    deadline: string | null;
    notes: string | null;
    submittedAt: string | null;
    lastReopenedAt: string | null;
    formType: string;
    joNumber: string;
    orderNumber: string;
    customerName: string;
    customerEmail: string | null;
    customerContact: string | null;
    orderDate: string;
    dueDate: string | null;
  };
  specFields: string[];
  items: ItemDraft[];
}) {
  const isLocked = form.status === "SUBMITTED";
  // Printed items are excluded from the editable set entirely (never just
  // disabled inline) — they already exist as their own rows server-side,
  // and resubmitting them here would create duplicates on top of the real,
  // untouched printed row (spec item 6: printed-item protection stays
  // separate from the form's own save/submit cycle even on the client).
  const printedItems = initialItems.filter((i) => i.printed);
  const editableInitial = initialItems.filter((i) => !i.printed);
  const [items, setItems] = useState<ItemDraft[]>(editableInitial.length > 0 ? editableInitial : [emptyItem()]);
  const [notes, setNotes] = useState(form.notes ?? "");

  const totalQty = items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0) + printedItems.reduce((sum, i) => sum + i.qty, 0);
  const itemsJson = useMemo(
    () => JSON.stringify(items.map((i) => ({ name: i.name, qty: i.qty, notes: i.notes, specs: i.specs }))),
    [items]
  );

  const saveDraftAction = saveCustomerFormDraftAction.bind(null, token);
  const submitAction = submitCustomerFormAction.bind(null, token);
  const [draftError, draftFormAction, draftPending] = useActionState(saveDraftAction, undefined);
  const [submitError, submitFormAction, submitPending] = useActionState(submitAction, undefined);

  function updateItem(i: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function updateSpec(i: number, field: string, value: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, specs: { ...it.specs, [field]: value } } : it)));
  }
  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  const deadlinePassed = form.deadline ? new Date(form.deadline).getTime() < Date.now() : false;

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <BrandLogo src={business.logoPath} alt={business.name} size={40} />
            <div>
              <p className="font-bold text-slate-900">{business.name}</p>
              {business.tagline && <p className="text-xs text-slate-500">{business.tagline}</p>}
            </div>
          </div>
          {business.email && (
            <a href={`mailto:${business.email}`} className="flex items-center gap-1 text-sm text-brand-600">
              <HelpCircle className="h-4 w-4" /> Need help? <span className="underline">Contact us</span>
            </a>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl gap-6 px-4 py-6 lg:grid lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
              <PenLine className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{form.title}</h1>
              <p className="text-sm text-slate-500">{form.instructions || "Please fill out this form with your requirements."}</p>
              <p className="mt-1 text-xs text-slate-400">
                Form for Job Order <span className="font-medium text-brand-600">{form.joNumber}</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-400">Customer</p>
              <p className="text-sm font-semibold text-slate-900">{form.customerName}</p>
              <p className="text-xs text-slate-500">{form.customerEmail}</p>
              <p className="text-xs text-slate-500">{form.customerContact}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Service / Product</p>
              <p className="text-sm font-semibold text-slate-900">{form.formType}</p>
              <p className="text-xs text-slate-500">{form.joNumber}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Order Date</p>
              <p className="text-sm font-semibold text-slate-900" suppressHydrationWarning>{formatDate(form.orderDate)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Due Date</p>
              <p className="text-sm font-semibold text-slate-900" suppressHydrationWarning>{form.dueDate ? formatDate(form.dueDate) : "—"}</p>
            </div>
          </div>

          {isLocked ? (
            <LockedFormView form={form} items={initialItems} totalQty={totalQty} specFields={specFields} />
          ) : (
            <>
              {form.lastReopenedAt && (
                <Alert tone="info">This form was reopened for editing by our team. Please review and resubmit your details.</Alert>
              )}
              {draftError && <Alert tone="error">{draftError}</Alert>}
              {submitError && <Alert tone="error">{submitError}</Alert>}

              <form id="customer-form" className="space-y-6">
                <input type="hidden" name="itemsJson" form="customer-form" value={itemsJson} />
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
                      {form.formType} Details / Items
                    </h2>
                    <Button type="button" variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, emptyItem()])}>
                      + Add Row
                    </Button>
                  </div>

                  <div className="hidden sm:block">
                    <Table>
                      <THead>
                        <TR>
                          <TH className="w-10">#</TH>
                          <TH>Name / Design</TH>
                          {specFields.map((f) => (
                            <TH key={f}>{f}</TH>
                          ))}
                          <TH>Notes</TH>
                          <TH className="w-20">Qty</TH>
                          <TH className="w-10" />
                        </TR>
                      </THead>
                      <TBody>
                        {items.map((it, i) => (
                          <TR key={it.id ?? i}>
                            <TD>{i + 1}</TD>
                            <TD>
                              <Input aria-label="Name / Design" required value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} />
                            </TD>
                            {specFields.map((f) => (
                              <TD key={f}>
                                <Input aria-label={f} value={it.specs[f] ?? ""} onChange={(e) => updateSpec(i, f, e.target.value)} />
                              </TD>
                            ))}
                            <TD>
                              <Input aria-label="Notes" placeholder="Optional notes..." value={it.notes} onChange={(e) => updateItem(i, { notes: e.target.value })} />
                            </TD>
                            <TD>
                              <Input aria-label="Qty" type="number" min={1} required value={it.qty} onChange={(e) => updateItem(i, { qty: Number(e.target.value) })} />
                            </TD>
                            <TD>
                              <button type="button" onClick={() => removeItem(i)} disabled={items.length === 1} className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30" aria-label="Remove row">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>

                  <div className="space-y-3 sm:hidden">
                    {items.map((it, i) => (
                      <div key={it.id ?? i} className="space-y-2 rounded-lg border border-slate-200 p-3">
                        <Label>Name / Design</Label>
                        <Input required value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} />
                        {specFields.map((f) => (
                          <div key={f}>
                            <Label>{f}</Label>
                            <Input value={it.specs[f] ?? ""} onChange={(e) => updateSpec(i, f, e.target.value)} />
                          </div>
                        ))}
                        <Label>Notes</Label>
                        <Input placeholder="Optional notes..." value={it.notes} onChange={(e) => updateItem(i, { notes: e.target.value })} />
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <Label>Qty</Label>
                            <Input type="number" min={1} required value={it.qty} onChange={(e) => updateItem(i, { qty: Number(e.target.value) })} />
                          </div>
                          <button type="button" onClick={() => removeItem(i)} disabled={items.length === 1} className="mt-5 rounded p-2 text-red-500 disabled:opacity-30">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="mt-3 text-right text-sm text-slate-500">
                    Total Quantity: <span className="font-semibold text-slate-900">{totalQty} pcs</span>
                  </p>

                  {printedItems.length > 0 && (
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <p className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-500">
                        <Lock className="h-3 w-3" /> Already printed — locked, cannot be edited
                      </p>
                      <div className="space-y-1">
                        {printedItems.map((it) => (
                          <div key={it.id} className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
                            <span>{it.name}</span>
                            <span>Qty {it.qty}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span>
                    Additional Notes (Optional)
                  </h2>
                  <Textarea
                    name="notes"
                    form="customer-form"
                    rows={3}
                    maxLength={1000}
                    placeholder="Add any special instructions, design notes, color preferences, or other details..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <Alert tone="warning">
                  Please review all details carefully before submitting. Once you click Submit, the form will be locked and can no longer be edited.
                </Alert>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" formAction={draftFormAction} variant="outline" size="lg" disabled={draftPending || submitPending}>
                    <Save className="h-4 w-4" /> {draftPending ? "Saving..." : "Save as Draft"}
                  </Button>
                  <Button type="submit" formAction={submitFormAction} size="lg" disabled={draftPending || submitPending}>
                    <Lock className="h-4 w-4" /> {submitPending ? "Submitting..." : "Save and Submit Form"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>

        <div className="mt-6 space-y-4 lg:mt-0">
          {form.deadline && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Clock className="h-3.5 w-3.5" /> Form Expires On
              </p>
              <p className={`mt-1 text-lg font-bold ${deadlinePassed ? "text-red-600" : "text-slate-900"}`} suppressHydrationWarning>{formatDateTime(form.deadline)}</p>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-slate-900">How It Works</p>
            <ol className="space-y-3 text-xs text-slate-600">
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">1</span>
                Fill out the required details for your order.
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-[10px] font-bold text-green-700">2</span>
                You can submit this form once. It becomes locked unless our team reopens it.
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">3</span>
                Our team will review your details and proceed with production.
              </li>
              <li className="flex gap-2">
                <Bell className="h-5 w-5 shrink-0 text-blue-500" />
                We&apos;ll notify you once your order is ready for the next step.
              </li>
            </ol>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold text-slate-900">Form Status</p>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${isLocked ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
              {isLocked ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
              {isLocked ? "Submitted & Locked" : "Not Yet Submitted"}
            </span>
            <p className="mt-2 text-xs text-slate-500" suppressHydrationWarning>
              {isLocked
                ? `Submitted on ${form.submittedAt ? formatDateTime(form.submittedAt) : "—"}.`
                : "Your form is editable. Please review all details carefully before saving. Once submitted, it will be locked."}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-green-600" /> Secure &amp; Private
            </p>
            <p className="mt-1 text-xs text-slate-500">This form is unique to your order and cannot be accessed by others.</p>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Need help?</p>
            <p className="mt-1 text-xs text-slate-600">Contact our team if you have any questions about this form.</p>
            {business.contactNumber && <p className="mt-2 text-xs text-slate-700">{business.contactNumber}</p>}
            {business.email && <p className="text-xs text-slate-700">{business.email}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function LockedFormView({
  form,
  items,
  totalQty,
  specFields,
}: {
  form: { submittedAt: string | null };
  items: ItemDraft[];
  totalQty: number;
  specFields: string[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-5">
        <CheckCircle2 className="h-8 w-8 shrink-0 text-green-600" />
        <div>
          <p className="font-semibold text-green-900">Form Submitted Successfully</p>
          <p className="text-sm text-green-700" suppressHydrationWarning>
            Submitted &amp; Locked{form.submittedAt ? ` on ${formatDateTime(form.submittedAt)}` : ""}. This form can no longer be edited.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="hidden sm:block">
          <Table>
            <THead>
              <TR>
                <TH className="w-10">#</TH>
                <TH>Name / Design</TH>
                {specFields.map((f) => (
                  <TH key={f}>{f}</TH>
                ))}
                <TH>Notes</TH>
                <TH className="w-20">Qty</TH>
                <TH className="w-24">Status</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((it, i) => (
                <TR key={it.id ?? i}>
                  <TD>{i + 1}</TD>
                  <TD className="font-medium text-slate-900">{it.name}</TD>
                  {specFields.map((f) => (
                    <TD key={f}>{it.specs[f] ?? "—"}</TD>
                  ))}
                  <TD>{it.notes || "—"}</TD>
                  <TD>{it.qty}</TD>
                  <TD>
                    {it.printed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                        <Lock className="h-3 w-3" /> Printed
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Submitted</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        <div className="space-y-3 sm:hidden">
          {items.map((it, i) => (
            <div key={it.id ?? i} className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-900">{it.name}</p>
              {specFields.length > 0 && (
                <p className="text-xs text-slate-500">{specFields.map((f) => `${f}: ${it.specs[f] ?? "—"}`).join(" · ")}</p>
              )}
              <p className="text-xs text-slate-500">Qty: {it.qty}</p>
              {it.notes && <p className="text-xs text-slate-500">{it.notes}</p>}
              <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${it.printed ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-blue-700"}`}>
                {it.printed && <Lock className="h-3 w-3" />}
                {it.printed ? "Printed" : "Submitted"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-right text-sm text-slate-500">
          Total Quantity: <span className="font-semibold text-slate-900">{totalQty} pcs</span>
        </p>
      </div>
    </div>
  );
}
