import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { EditorPanel } from "@/components/documents/editor-shell";
import { ToggleCategoryButton } from "./toggle-category-button";
import { NewCategoryForm } from "./new-category-form";

export default async function ExpenseCategoriesPage() {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "EXPENSE_MANAGE"))) redirect("/admin/expenses");

  const categories = await prisma.expenseCategory.findMany({
    include: { _count: { select: { expenses: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expense Categories</h1>
          <p className="text-sm text-slate-500">
            Admin can add as many categories as the business needs — this list is never hardcoded.
          </p>
        </div>
        <Link href="/admin/expenses">
          <Button variant="outline">Back to Expenses</Button>
        </Link>
      </div>

      <EditorPanel title="Add Category">
        <NewCategoryForm />
      </EditorPanel>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Expenses Recorded</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {categories.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium text-slate-900">{c.name}</TD>
                <TD className="text-sm text-slate-500">{c._count.expenses}</TD>
                <TD>
                  <Badge tone={c.active ? "green" : "slate"}>{c.active ? "Active" : "Inactive"}</Badge>
                </TD>
                <TD>
                  <ToggleCategoryButton categoryId={c.id} active={c.active} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {categories.length === 0 && <EmptyState label="No categories yet." />}
      </Card>
    </div>
  );
}
