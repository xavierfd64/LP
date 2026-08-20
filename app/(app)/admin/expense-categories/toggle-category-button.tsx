"use client";

import { Button } from "@/components/ui/button";
import { toggleExpenseCategoryActiveAction } from "@/app/actions/expenses";

export function ToggleCategoryButton({ categoryId, active }: { categoryId: string; active: boolean }) {
  return (
    <form action={toggleExpenseCategoryActiveAction.bind(null, categoryId)}>
      <Button type="submit" size="sm" variant={active ? "destructive" : "outline"}>
        {active ? "Deactivate" : "Activate"}
      </Button>
    </form>
  );
}
