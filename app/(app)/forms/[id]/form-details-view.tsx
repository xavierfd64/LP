"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, Mail, MessageCircle, RefreshCw, Lock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import { editFormItemAction, deleteFormItemAction, markItemPrintedAction, resendFormLinkAction, recordLinkCopiedAction, regenerateFormLinkAction } from "@/app/actions/customer-form";
import { AddItemsDialog } from "./add-items-dialog";
import { AddOrderDialog } from "./add-order-dialog";
import { ReopenFormDialog } from "./reopen-form-dialog";
import { UnlockItemDialog } from "./unlock-item-dialog";

type FormItem = { id: string; name: string; qty: number; notes: string | null; specs: Record<string, string>; printed: boolean; printedAt: string | null; printedByName: string | null };
type Delivery = { id: string; method: string; recipient: string; deliveredByName: string; status: string; detail: string | null; createdAt: string };
type HistoryEntry = { id: string; action: string; actorName: string; changes: Record<string, unknown>; createdAt: string };
type FileEntry = { id: string; filename: string; category: string; uploadedByName: string; createdAt: string };
type AdditionalOrder = { id: string; orderNumber: string; addedByName: string; addedAt: string; note: string | null };

const HISTORY_LABELS: Record<string, string> = {
  FORM_CREATED: "Form created",
  FORM_LINK_GENERATED: "Form link generated",
  FORM_LINK_SENT: "Form link sent",
  FORM_LINK_COPIED: "Form link copied",
  FORM_LINK_REGENERATED: "Form link regenerated",
  FORM_ACCESSED: "Customer opened the form",
  FORM_ITEM_ADDED: "Item(s) added",
  FORM_ITEM_EDITED: "Item edited",
  FORM_ITEM_DELETED: "Item deleted",
  FORM_SAVED_DRAFT: "Customer saved a draft",
  FORM_SUBMITTED: "Form submitted",
  FORM_LOCKED: "Form locked",
  FORM_REOPENED: "Form reopened",
  FORM_ORDER_ADDED: "Order added",
  FORM_ITEM_PRINTED: "Item marked printed",
  FORM_ITEM_UNLOCK_OVERRIDE: "Printed item unlocked (override)",
};

type Tab = "response" | "items" | "history" | "files" | "delivery";

export function FormDetailsView({
  canManageLink,
  canEdit,
  canReopen,
  canUnlockOverride,
  form,
  items,
  additionalOrders,
  activeLinkUrl,
  activeLinkExpiresAt,
  deliveries,
  history,
  files,
}: {
  canManageLink: boolean;
  canEdit: boolean;
  canReopen: boolean;
  canUnlockOverride: boolean;
  form: {
    id: string;
    title: string;
    formType: string;
    instructions: string | null;
    status: "OPEN" | "SUBMITTED";
    deadline: string | null;
    notes: string | null;
    submittedAt: string | null;
    lastReopenedAt: string | null;
    lastReopenedByName: string | null;
    lastReopenReason: string | null;
    createdByName: string | null;
    createdAt: string;
    jobOrderId: string;
    joNumber: string;
    jobOrderStatus: string;
    orderId: string;
    orderNumber: string;
    customerId: string;
    customerName: string;
    customerEmail: string | null;
    customerContact: string | null;
  };
  items: FormItem[];
  additionalOrders: AdditionalOrder[];
  activeLinkUrl: string | null;
  activeLinkExpiresAt: string | null;
  deliveries: Delivery[];
  history: HistoryEntry[];
  files: FileEntry[];
}) {
  const [tab, setTab] = useState<Tab>("response");
  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
  const printedCount = items.filter((i) => i.printed).length;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "response", label: "Form Response" },
    { key: "items", label: "Item Details", count: items.length },
    { key: "history", label: "History", count: history.length },
    { key: "files", label: "Files", count: files.length },
    { key: "delivery", label: "Link & Delivery" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="mb-1 text-xs text-slate-400">
            <Link href="/production" className="hover:underline">Production</Link> ›{" "}
            <Link href={`/job-orders/${form.jobOrderId}`} className="hover:underline">{form.joNumber}</Link> › Customer Form
          </nav>
          <h1 className="text-2xl font-bold text-slate-900">{form.title}</h1>
        </div>
        {form.status === "SUBMITTED" ? (
          <Badge tone="green" className="text-sm">
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Submitted &amp; Locked
          </Badge>
        ) : (
          <Badge tone="blue" className="text-sm">Open — awaiting customer</Badge>
        )}
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
          <Field label="Order Number" value={<Link href={`/orders/${form.orderId}`} className="text-brand-600 underline">{form.orderNumber}</Link>} />
          <Field label="Job Order" value={<Link href={`/job-orders/${form.jobOrderId}`} className="text-brand-600 underline">{form.joNumber}</Link>} />
          <Field label="Customer" value={form.customerName} />
          <Field label="Product / Service" value={form.formType} />
          <Field label="Form Type" value={form.title} />
          <Field label="Production Status" value={form.jobOrderStatus} />
          <Field label="Total Quantity" value={`${totalQty} pcs`} />
          <Field label="Total Items" value={`${items.length} (${printedCount} printed)`} />
          {form.status === "SUBMITTED" && <Field label="Submitted On" dateSensitive value={form.submittedAt ? formatDateTime(form.submittedAt) : "—"} />}
          {form.status === "SUBMITTED" && <Field label="Submitted By" value={form.customerName} />}
          {form.lastReopenedAt && <Field label="Last Reopened" dateSensitive value={`${formatDateTime(form.lastReopenedAt)} by ${form.lastReopenedByName ?? "—"}`} />}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {canReopen && form.status === "SUBMITTED" && <ReopenFormDialog formId={form.id} />}
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-4 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium",
                tab === t.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              {t.label}
              {t.count !== undefined && <span className="ml-1 text-xs text-slate-400">({t.count})</span>}
            </button>
          ))}
        </nav>
      </div>

      {tab === "response" && (
        <Card>
          <CardHeader>
            <CardTitle>Customer-Submitted Response</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {form.status !== "SUBMITTED" && <p className="text-sm text-slate-400">This form has not been submitted yet.</p>}
            <ItemsReadTable items={items} />
            {form.notes && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Additional Notes</p>
                <p className="text-sm whitespace-pre-wrap text-slate-700">{form.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "items" && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Items in this Form ({items.length})</CardTitle>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <AddItemsDialog formId={form.id} />
                <AddOrderDialog formId={form.id} />
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <ItemsManageTable items={items} canEdit={canEdit} canUnlockOverride={canUnlockOverride} />
            {additionalOrders.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Additional Orders Attached</p>
                <div className="space-y-1">
                  {additionalOrders.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-1.5 text-sm">
                      <Link href={`/orders/${a.id}`} className="text-brand-600 underline">
                        {a.orderNumber}
                      </Link>
                      <span className="text-xs text-slate-400" suppressHydrationWarning>
                        added by {a.addedByName} on {formatDate(a.addedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "history" && (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 && <p className="text-sm text-slate-400">No history yet.</p>}
            <div className="space-y-3">
              {history.map((h) => (
                <div key={h.id} className="flex gap-3 border-b border-slate-100 pb-3 last:border-0">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{HISTORY_LABELS[h.action] ?? h.action}</p>
                    <p className="text-xs text-slate-500" suppressHydrationWarning>
                      {h.actorName} · {formatDateTime(h.createdAt)}
                    </p>
                    {h.changes && Object.keys(h.changes).length > 0 && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        {Object.entries(h.changes)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "files" && (
        <Card>
          <CardHeader>
            <CardTitle>Files</CardTitle>
          </CardHeader>
          <CardContent>
            {files.length === 0 && <p className="text-sm text-slate-400">No files uploaded yet.</p>}
            <div className="space-y-1">
              {files.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-1.5 text-sm">
                  <span className="font-medium text-slate-900">{f.filename}</span>
                  <span className="text-xs text-slate-400" suppressHydrationWarning>
                    {f.category} · {f.uploadedByName} · {formatDate(f.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "delivery" && (
        <LinkDeliveryPanel formId={form.id} canManageLink={canManageLink} activeLinkUrl={activeLinkUrl} activeLinkExpiresAt={activeLinkExpiresAt} deliveries={deliveries} />
      )}
    </div>
  );
}

/** `dateSensitive` suppresses the hydration-mismatch warning for values containing a client-formatted date — server (business-timezone) and browser (visitor-local) render the same instant differently, which is a real formatting difference, not a bug (see formatDate/formatDateTime in lib/utils.ts). */
function Field({ label, value, dateSensitive }: { label: string; value: React.ReactNode; dateSensitive?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-900" suppressHydrationWarning={dateSensitive}>{value}</p>
    </div>
  );
}

function ItemsReadTable({ items }: { items: FormItem[] }) {
  const specKeys = Array.from(new Set(items.flatMap((i) => Object.keys(i.specs))));
  return (
    <Table>
      <THead>
        <TR>
          <TH>#</TH>
          <TH>Name / Design</TH>
          {specKeys.map((k) => (
            <TH key={k}>{k}</TH>
          ))}
          <TH>Notes</TH>
          <TH>Qty</TH>
          <TH>Status</TH>
        </TR>
      </THead>
      <TBody>
        {items.map((it, i) => (
          <TR key={it.id}>
            <TD>{i + 1}</TD>
            <TD className="font-medium text-slate-900">{it.name}</TD>
            {specKeys.map((k) => (
              <TD key={k}>{it.specs[k] ?? "—"}</TD>
            ))}
            <TD>{it.notes || "—"}</TD>
            <TD>{it.qty}</TD>
            <TD>
              {it.printed ? (
                <Badge tone="slate">
                  <Lock className="mr-1 h-3 w-3" /> Printed
                </Badge>
              ) : (
                <Badge tone="blue">Submitted</Badge>
              )}
            </TD>
          </TR>
        ))}
        {items.length === 0 && (
          <TR>
            <TD colSpan={5 + specKeys.length} className="py-6 text-center text-slate-400">
              No items yet.
            </TD>
          </TR>
        )}
      </TBody>
    </Table>
  );
}

function ItemsManageTable({ items, canEdit, canUnlockOverride }: { items: FormItem[]; canEdit: boolean; canUnlockOverride: boolean }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setBusyId(id);
    setRowError(null);
    const result = await deleteFormItemAction(id);
    setBusyId(null);
    if (result) setRowError(result);
    else router.refresh();
  }

  async function handleMarkPrinted(id: string) {
    setBusyId(id);
    setRowError(null);
    await markItemPrintedAction(id);
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {rowError && <p className="text-sm text-red-600">{rowError}</p>}
      {items.map((it, i) => (
        <div key={it.id} className={cn("rounded-lg border p-3", it.printed ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white")}>
          {editingId === it.id ? (
            <EditItemRow item={it} onDone={() => setEditingId(null)} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  #{i + 1} {it.name}
                </p>
                <p className="text-xs text-slate-500">
                  Qty {it.qty}
                  {Object.entries(it.specs).length > 0 && ` · ${Object.entries(it.specs).map(([k, v]) => `${k}: ${v}`).join(", ")}`}
                  {it.notes ? ` · ${it.notes}` : ""}
                </p>
                {it.printed && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-600" suppressHydrationWarning>
                    <Lock className="h-3 w-3" /> Printed {it.printedAt ? formatDateTime(it.printedAt) : ""} by {it.printedByName ?? "—"}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!it.printed && canEdit && (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(it.id)}>
                      Edit
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleDelete(it.id)} disabled={busyId === it.id}>
                      Delete
                    </Button>
                    <Button type="button" size="sm" onClick={() => handleMarkPrinted(it.id)} disabled={busyId === it.id}>
                      {busyId === it.id ? "Working..." : "Mark as Printed"}
                    </Button>
                  </>
                )}
                {it.printed && canUnlockOverride && <UnlockItemDialog itemId={it.id} itemName={it.name} />}
              </div>
            </div>
          )}
        </div>
      ))}
      {items.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No items yet.</p>}
    </div>
  );
}

function EditItemRow({ item, onDone }: { item: FormItem; onDone: () => void }) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.qty);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [specs, setSpecs] = useState(item.specs);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("qty", String(qty));
    fd.set("notes", notes);
    fd.set("specsJson", JSON.stringify(specs));
    const result = await editFormItemAction(item.id, fd);
    setPending(false);
    if (result) {
      setError(result);
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <Label>Name / Design</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Qty</Label>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </div>
        {Object.keys(specs).map((k) => (
          <div key={k}>
            <Label>{k}</Label>
            <Input value={specs[k] ?? ""} onChange={(e) => setSpecs((prev) => ({ ...prev, [k]: e.target.value }))} />
          </div>
        ))}
        <div>
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function LinkDeliveryPanel({
  formId,
  canManageLink,
  activeLinkUrl,
  activeLinkExpiresAt,
  deliveries,
}: {
  formId: string;
  canManageLink: boolean;
  activeLinkUrl: string | null;
  activeLinkExpiresAt: string | null;
  deliveries: Delivery[];
}) {
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCopy() {
    if (!activeLinkUrl) return;
    await navigator.clipboard.writeText(activeLinkUrl);
    await recordLinkCopiedAction(formId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleResend(method: "EMAIL" | "MESSENGER") {
    setPending(method);
    setError(null);
    const result = await resendFormLinkAction(formId, method);
    setPending(null);
    if (result) setError(result);
  }

  async function handleRegenerate() {
    setPending("REGENERATE");
    await regenerateFormLinkAction(formId);
    setPending(null);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Form Link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {activeLinkUrl ? (
            <>
              <div className="flex items-center gap-2">
                <Input readOnly value={activeLinkUrl} className="text-brand-600" />
                <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="h-3.5 w-3.5" /> {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
              {activeLinkExpiresAt && <p className="text-xs text-slate-500" suppressHydrationWarning>Link expires on {formatDateTime(activeLinkExpiresAt)}.</p>}
            </>
          ) : (
            <p className="text-sm text-slate-400">No active link — regenerate one below.</p>
          )}
          {canManageLink && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => handleResend("EMAIL")} disabled={pending === "EMAIL"}>
                <Mail className="h-3.5 w-3.5" /> {pending === "EMAIL" ? "Sending..." : "Resend Email"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleResend("MESSENGER")} disabled={pending === "MESSENGER"}>
                <MessageCircle className="h-3.5 w-3.5" /> {pending === "MESSENGER" ? "Sending..." : "Resend Messenger"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleRegenerate} disabled={pending === "REGENERATE"}>
                <RefreshCw className="h-3.5 w-3.5" /> {pending === "REGENERATE" ? "Regenerating..." : "Regenerate New Link"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Method</TH>
                <TH>Recipient</TH>
                <TH>Sent By</TH>
                <TH>Date/Time</TH>
                <TH>Status</TH>
                <TH>Detail</TH>
              </TR>
            </THead>
            <TBody>
              {deliveries.map((d) => (
                <TR key={d.id}>
                  <TD>{d.method}</TD>
                  <TD className="max-w-[200px] truncate">{d.recipient}</TD>
                  <TD>{d.deliveredByName}</TD>
                  <TD suppressHydrationWarning>{formatDateTime(d.createdAt)}</TD>
                  <TD>
                    <Badge tone={d.status === "SENT" || d.status === "DELIVERED" || d.status === "COPIED" ? "green" : d.status === "FAILED" ? "red" : "yellow"}>{d.status}</Badge>
                  </TD>
                  <TD className="max-w-[200px] truncate text-xs text-slate-400">{d.detail ?? "—"}</TD>
                </TR>
              ))}
              {deliveries.length === 0 && (
                <TR>
                  <TD colSpan={6} className="py-6 text-center text-slate-400">
                    No delivery attempts recorded yet.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
