"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { createExpenseCategoryAction, updateExpenseCategoryAction } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type Category = { id: string; name: string; description: string | null; active: boolean };

/**
 * One modal, two modes — mirrors the create/edit-share pattern already
 * used by ExpenseForm (spec Part B section 4/5: "Add Category" and "Edit
 * Category" are the same fields, just pre-filled). A real portal dialog,
 * not window.confirm/a full page nav, matching this app's established
 * modal convention (see DeleteExpenseButton).
 */
export function CategoryFormModal({ category }: { category?: Category }) {
  const [open, setOpen] = useState(false);
  const action = category ? updateExpenseCategoryAction.bind(null, category.id) : createExpenseCategoryAction;
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <>
      {category ? (
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-brand-600 hover:underline">
          Edit
        </button>
      ) : (
        <Button type="button" onClick={() => setOpen(true)}>
          + Add Category
        </Button>
      )}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">
                  {category ? "Edit Expense Category" : "Add Expense Category"}
                </h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form action={formAction} className="space-y-3">
                {error && <Alert tone="error">{error}</Alert>}
                <div>
                  <Label htmlFor="cat-name">Category Name *</Label>
                  <Input id="cat-name" name="name" required maxLength={60} defaultValue={category?.name ?? ""} placeholder="e.g. Equipment Rental" />
                </div>
                <div>
                  <Label htmlFor="cat-description">Description</Label>
                  <Textarea
                    id="cat-description"
                    name="description"
                    rows={2}
                    maxLength={300}
                    defaultValue={category?.description ?? ""}
                    placeholder="Optional — e.g. Rental fees for temporary production equipment."
                  />
                </div>
                <div>
                  <Label htmlFor="cat-active">Status</Label>
                  <Select id="cat-active" name="active" defaultValue={category ? String(category.active) : "true"}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? "Saving…" : "Save Category"}
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
