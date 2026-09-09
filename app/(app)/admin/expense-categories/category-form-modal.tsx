"use client";

import { useActionState, useState } from "react";
import { Tag } from "lucide-react";
import { createExpenseCategoryAction, updateExpenseCategoryAction } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

type Category = { id: string; name: string; description: string | null; active: boolean };

/**
 * One modal, two modes — mirrors the create/edit-share pattern already
 * used by ExpenseForm (spec Part B section 4/5: "Add Category" and "Edit
 * Category" are the same fields, just pre-filled). Uses the shared Modal
 * (Sept 9 — Unified Modal Design System) rather than a hand-rolled portal
 * overlay.
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
      <Modal open={open} onClose={() => setOpen(false)} maxWidthClassName="max-w-md">
        <ModalHeader
          icon={<Tag className="h-5 w-5" />}
          title={category ? "Edit Expense Category" : "Add Expense Category"}
          onClose={() => setOpen(false)}
        />
        <form action={formAction}>
          <ModalBody>
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
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save Category"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
