"use client";

import { useActionState } from "react";
import { createExpenseAction, updateExpenseAction } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EditorPanel } from "@/components/documents/editor-shell";

type Category = { id: string; name: string };
type Expense = {
  id: string;
  expenseDate: string;
  categoryId: string;
  description: string;
  payee: string | null;
  amount: number;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
};

export function ExpenseForm({ categories, expense }: { categories: Category[]; expense?: Expense }) {
  const action = expense ? updateExpenseAction.bind(null, expense.id) : createExpenseAction;
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <EditorPanel title="Record Operating Expense">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="expenseDate">Expense Date *</Label>
            <Input id="expenseDate" name="expenseDate" type="date" required defaultValue={expense?.expenseDate ?? new Date().toISOString().slice(0, 10)} />
          </div>
          <div>
            <Label htmlFor="categoryId">Category *</Label>
            <Select id="categoryId" name="categoryId" required defaultValue={expense?.categoryId ?? ""}>
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">Description *</Label>
            <Input id="description" name="description" required defaultValue={expense?.description ?? ""} placeholder="e.g. Monthly shop electricity bill" />
          </div>
          <div>
            <Label htmlFor="payee">Paid To / Payee</Label>
            <Input id="payee" name="payee" defaultValue={expense?.payee ?? ""} placeholder="e.g. Meralco" />
          </div>
          <div>
            <Label htmlFor="amount">Amount *</Label>
            <Input id="amount" name="amount" type="number" min={0.01} step="0.01" required defaultValue={expense?.amount ?? ""} />
          </div>
          <div>
            <Label htmlFor="paymentMethod">Payment Method *</Label>
            <Select id="paymentMethod" name="paymentMethod" required defaultValue={expense?.paymentMethod ?? "CASH"}>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="GCASH">GCash</option>
              <option value="MAYA">Maya</option>
              <option value="CHEQUE">Cheque</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="referenceNumber">Reference Number</Label>
            <Input id="referenceNumber" name="referenceNumber" defaultValue={expense?.referenceNumber ?? ""} placeholder="Optional" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={expense?.notes ?? ""} placeholder="Optional" />
          </div>
        </div>
      </EditorPanel>

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : expense ? "Save Changes" : "Save Expense"}
        </Button>
        <a href="/admin/expenses">
          <Button type="button" variant="ghost" size="lg">
            Cancel
          </Button>
        </a>
      </div>
    </form>
  );
}
