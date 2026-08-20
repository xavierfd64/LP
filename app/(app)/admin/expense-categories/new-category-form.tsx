"use client";

import { useActionState } from "react";
import { createExpenseCategoryAction } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function NewCategoryForm() {
  const [error, formAction, pending] = useActionState(createExpenseCategoryAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      {error && (
        <div className="sm:basis-full">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="flex-1">
        <Label htmlFor="name">Category Name</Label>
        <Input id="name" name="name" required placeholder="e.g. Machine Maintenance" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add Category"}
      </Button>
    </form>
  );
}
