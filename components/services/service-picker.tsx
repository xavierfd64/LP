"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Plus, X, Check } from "lucide-react";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { searchActiveServicesAction, quickAddServiceAction, type ServiceSearchResult } from "@/app/actions/services";

/**
 * Searchable, active-only Service picker — replaces free-text "product
 * type" inputs across Inquiry/Quotation/Order/Job Order forms (spec:
 * "must NOT be free-text... only saved and active services should
 * appear"). Mirrors components/customers/customer-picker.tsx's shape:
 * search-as-you-type, an optional "+" quick-add (permission-gated at the
 * server action, so the button can render for anyone — a Staff member
 * without SERVICE_MANAGE just gets an error from the action, same pattern
 * as every other permission check in this app), and onSpecFieldsChange so
 * the parent form can render the selected service's configured
 * spec-field inputs.
 */
export function ServicePicker({
  name,
  initialService,
  required = true,
  canAddService = true,
  onSelect,
}: {
  name: string;
  initialService?: ServiceSearchResult | null;
  required?: boolean;
  canAddService?: boolean;
  onSelect?: (s: ServiceSearchResult) => void;
}) {
  const [selected, setSelected] = useState<ServiceSearchResult | null>(initialService ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ServiceSearchResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      searchActiveServicesAction(query).then(setResults);
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
      <Label>Service</Label>

      {selected ? (
        <div className="flex items-center justify-between rounded-md border border-slate-300 bg-slate-50 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{selected.name}</p>
            {selected.category && <p className="text-xs text-slate-500">{selected.category}</p>}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
            }}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            aria-label="Change service"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search services (e.g. tarp, uni)…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              className="pl-8"
            />
            {open && (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                {results === null && <p className="px-3 py-2 text-xs text-slate-400">Searching…</p>}
                {results?.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No matching services.</p>}
                {results?.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelected(s);
                      setOpen(false);
                      onSelect?.(s);
                    }}
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{s.name}</span>
                    {s.category && <span className="text-xs text-slate-500">{s.category}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {canAddService && (
            <Button type="button" variant="outline" onClick={() => setQuickAddOpen(true)} aria-label="Add new service">
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {quickAddOpen && (
        <QuickAddServiceModal
          initialName={query}
          onClose={() => setQuickAddOpen(false)}
          onCreated={(s) => {
            setSelected(s);
            setQuickAddOpen(false);
            onSelect?.(s);
          }}
        />
      )}
    </div>
  );
}

function QuickAddServiceModal({
  initialName,
  onClose,
  onCreated,
}: {
  initialName: string;
  onClose: () => void;
  onCreated: (s: ServiceSearchResult) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await quickAddServiceAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(result.service);
  }

  if (typeof document === "undefined") return null;

  // Rendered via a portal for the same reason as QuickAddCustomerModal:
  // this can be opened from inside a ServicePicker that's itself inside an
  // outer transaction <form>, and a nested <form> silently breaks submission.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">New Service</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <form action={handleSubmit} className="mt-3 space-y-3">
          <div>
            <Label htmlFor="svc-name">Service Name *</Label>
            <Input id="svc-name" name="name" required defaultValue={initialName} />
          </div>
          <div>
            <Label htmlFor="svc-category">Category</Label>
            <Input id="svc-category" name="category" placeholder="e.g. Apparel, Signage & Printing" />
          </div>
          <div>
            <Label htmlFor="svc-description">Description</Label>
            <Textarea id="svc-description" name="description" rows={2} />
          </div>
          <div>
            <Label htmlFor="svc-specFields">Spec Fields (comma-separated, optional)</Label>
            <Input id="svc-specFields" name="specFields" placeholder="e.g. Width, Height, Material, Finishing" />
          </div>
          <p className="text-xs text-slate-400">
            Production flow can be assigned later from the Service Master (Admin → Services).
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : <><Check className="h-4 w-4" /> Create &amp; Select</>}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
