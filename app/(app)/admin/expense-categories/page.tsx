import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { CategoryFormModal } from "./category-form-modal";
import { DeleteCategoryButton } from "./delete-category-button";

/**
 * Admin (and Staff granted EXPENSE_MANAGE) can add, edit, and
 * activate/deactivate the categories used when recording Operating
 * Expenses — this list is never hardcoded (Aug 20 2nd update, Part B).
 * A category with any expense history can only be deactivated, never
 * destroyed; only a never-used category can be permanently deleted.
 */
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
            Manage the categories used for recording operating expenses. Categories with recorded expenses can be
            deactivated but not deleted.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/expenses">
            <Button variant="outline">Back to Expenses</Button>
          </Link>
          <CategoryFormModal />
        </div>
      </div>

      {/* Desktop/tablet table */}
      <Card className="hidden overflow-x-auto sm:block">
        <Table>
          <THead>
            <TR>
              <TH>Category</TH>
              <TH>Expenses Recorded</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {categories.map((c) => (
              <TR key={c.id}>
                <TD>
                  <span className="font-medium text-slate-900">{c.name}</span>
                  {c.description && <span className="block text-xs text-slate-400">{c.description}</span>}
                </TD>
                <TD className="text-sm text-slate-500">{c._count.expenses}</TD>
                <TD>
                  <Badge tone={c.active ? "green" : "slate"}>{c.active ? "Active" : "Inactive"}</Badge>
                </TD>
                <TD>
                  <div className="flex items-center gap-3">
                    <CategoryFormModal category={c} />
                    {c._count.expenses === 0 && <DeleteCategoryButton categoryId={c.id} categoryName={c.name} />}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {categories.length === 0 && <EmptyState label="No categories yet." />}
      </Card>

      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {categories.length === 0 && (
          <Card className="p-4">
            <EmptyState label="No categories yet." />
          </Card>
        )}
        {categories.map((c) => (
          <Card key={c.id} className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-slate-900">{c.name}</span>
              <Badge tone={c.active ? "green" : "slate"}>{c.active ? "Active" : "Inactive"}</Badge>
            </div>
            {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
            <p className="text-xs text-slate-400">{c._count.expenses} expense record{c._count.expenses === 1 ? "" : "s"}</p>
            <div className="flex items-center gap-3 pt-1">
              <CategoryFormModal category={c} />
              {c._count.expenses === 0 && <DeleteCategoryButton categoryId={c.id} categoryName={c.name} />}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
