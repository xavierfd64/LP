"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Plus, X, Check } from "lucide-react";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  searchCustomersForTransactionAction,
  quickAddCustomerAction,
  type CustomerSearchResult,
} from "@/app/actions/customers";

/**
 * Professional searchable Customer field used by the Quotation/Order
 * preparation forms — replaces a giant "load every customer" dropdown.
 * Search-as-you-type across name/company/email/contact/Facebook/Customer ID
 * (debounced, never loads the full list), always shows Customer Name as the
 * primary line, and offers a "+" quick-add that creates a permanent,
 * login-free Customer Record and auto-selects it in the current transaction.
 */
export function CustomerPicker({
  name,
  initialCustomer,
  required = true,
  onSelect,
}: {
  /** Form field name the selected customerId is submitted under. */
  name: string;
  initialCustomer?: CustomerSearchResult | null;
  required?: boolean;
  /** Optional — fires on every selection (search result or quick-add), for callers that navigate immediately instead of waiting on a form submit (e.g. the SOA customer lookup). */
  onSelect?: (c: CustomerSearchResult) => void;
}) {
  const [selected, setSelected] = useState<CustomerSearchResult | null>(initialCustomer ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      searchCustomersForTransactionAction(query)
        .then((r) => {
          setResults(r);
          setSearchError(null);
        })
        .catch((e) => setSearchError(e instanceof Error ? e.message : "Search failed."));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} required={required} />
      <Label>Customer</Label>

      {selected ? (
        <div className="flex items-center justify-between rounded-md border border-slate-300 bg-slate-50 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {selected.name}
              {selected.companyName ? ` (${selected.companyName})` : ""}
            </p>
            <p className="text-xs text-slate-500">
              {selected.displayId}
              {selected.contactNumber ? ` · ${selected.contactNumber}` : ""}
              {!selected.hasLogin && " · Login Status: Not Activated"}
              {selected.isQualifiedForTerms && " · Qualified for terms"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
            }}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            aria-label="Change customer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name, email, contact number, Facebook, or Customer ID…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              className="pl-8"
            />
            {open && query.trim() && (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                {searchError && <p className="px-3 py-2 text-xs text-red-600">{searchError}</p>}
                {!searchError && results === null && <p className="px-3 py-2 text-xs text-slate-400">Searching…</p>}
                {!searchError && results?.length === 0 && (
                  <p className="px-3 py-2 text-xs text-slate-400">No customers found. Use “+ New Customer” to add one.</p>
                )}
                {results?.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelected(c);
                      setOpen(false);
                      onSelect?.(c);
                    }}
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">
                      {c.name}
                      {c.companyName ? ` (${c.companyName})` : ""}
                    </span>
                    <span className="text-xs text-slate-500">
                      {c.displayId}
                      {c.email ? ` · ${c.email}` : ""}
                      {c.contactNumber ? ` · ${c.contactNumber}` : ""}
                      {!c.hasLogin && " · No login account"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button type="button" variant="outline" onClick={() => setQuickAddOpen(true)} aria-label="Add new customer">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      {quickAddOpen && (
        <QuickAddCustomerModal
          initialName={query}
          onClose={() => setQuickAddOpen(false)}
          onCreated={(c) => {
            setSelected(c);
            setQuickAddOpen(false);
            onSelect?.(c);
          }}
        />
      )}
    </div>
  );
}

export function QuickAddCustomerModal({
  initialName,
  onClose,
  onCreated,
}: {
  initialName: string;
  onClose: () => void;
  onCreated: (c: CustomerSearchResult) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await quickAddCustomerAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(result.customer);
  }

  // Rendered via a portal straight onto document.body: QuickAddCustomerModal
  // is opened from inside CustomerPicker, which itself lives inside the
  // outer Quotation/Order preparation <form> — nesting this modal's own
  // <form> inside that one is invalid HTML and silently breaks submission
  // (the browser/React can't tell which form a nested submit belongs to).
  // A portal keeps the DOM node a sibling of <body>, not a descendant of
  // any surrounding form, regardless of where CustomerPicker is used.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">New Customer Record</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <form action={handleSubmit} className="mt-3 space-y-3">
          <div>
            <Label htmlFor="qa-name">Complete Name *</Label>
            <Input id="qa-name" name="name" required defaultValue={initialName} />
          </div>
          <div>
            <Label htmlFor="qa-address">Address *</Label>
            <Textarea id="qa-address" name="address" required rows={2} />
          </div>
          <div>
            <Label htmlFor="qa-contact">Contact Number *</Label>
            <Input id="qa-contact" name="contactNumber" required />
          </div>
          <div>
            <Label htmlFor="qa-email">Email (optional)</Label>
            <Input id="qa-email" name="email" type="email" />
          </div>
          <div>
            <Label htmlFor="qa-fb">Facebook (optional)</Label>
            <Input id="qa-fb" name="facebookUrl" placeholder="facebook.com/username" />
          </div>
          <p className="text-xs text-slate-400">
            No login/password is created here — this customer can transact right away. A login can be activated
            later from the customer&apos;s record.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                "Saving…"
              ) : (
                <>
                  <Check className="h-4 w-4" /> Create &amp; Select
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
