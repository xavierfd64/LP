import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Input, Label, Select } from "@/components/ui/input";
import { DeleteExpenseButton } from "./delete-expense-button";

export default async function ExpensesPage({ searchParams }: PageProps<"/admin/expenses">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "EXPENSE_VIEW"))) redirect("/dashboard");
  const canManage = user.role === "ADMIN" || (await can(user, "EXPENSE_MANAGE"));

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const categoryId = typeof sp.categoryId === "string" ? sp.categoryId : "";
  const method = typeof sp.method === "string" ? sp.method : "";
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { description: { contains: q, mode: "insensitive" } },
      { payee: { contains: q, mode: "insensitive" } },
      { referenceNumber: { contains: q, mode: "insensitive" } },
      { expenseNumber: { contains: q, mode: "insensitive" } },
    ];
  }
  if (categoryId) where.categoryId = categoryId;
  if (method) where.paymentMethod = method;
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from);
    if (to) range.lt = new Date(new Date(to).getTime() + 86400000);
    where.expenseDate = range;
  }

  const [expenses, activeCategories, selectedCategory] = await Promise.all([
    prisma.operatingExpense.findMany({
      where,
      include: { category: true },
      orderBy: { expenseDate: "desc" },
    }),
    prisma.expenseCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    categoryId ? prisma.expenseCategory.findUnique({ where: { id: categoryId } }) : Promise.resolve(null),
  ]);

  // The filter dropdown must still show a previously-selected category even
  // if it has since been deactivated — otherwise the URL's ?categoryId=
  // silently falls back to "All Categories" in the select's rendering.
  const filterCategories =
    selectedCategory && !activeCategories.some((c) => c.id === selectedCategory.id)
      ? [...activeCategories, selectedCategory].sort((a, b) => a.name.localeCompare(b.name))
      : activeCategories;

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operating Expenses</h1>
          <p className="text-sm text-slate-500">
            Business overhead — rent, utilities, salaries, and similar costs. Distinct from production cost, which lives on the Service Master.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/expense-categories">
            <Button variant="outline">Manage Categories</Button>
          </Link>
          {canManage && (
            <Link href="/admin/expenses/new">
              <Button>+ Record Expense</Button>
            </Link>
          )}
        </div>
      </div>

      <Card className="px-5 py-4">
        {selectedCategory ? (
          <>
            <p className="text-sm font-semibold text-slate-900">{selectedCategory.name}</p>
            <p className="text-xs text-slate-500">
              {expenses.length} expense record{expenses.length === 1 ? "" : "s"}
              {(q || method || from || to) && " matching the other filters"}
            </p>
          </>
        ) : (
          <p className="text-xs uppercase text-slate-500">Total (matching filters)</p>
        )}
        <p className="text-2xl font-bold text-slate-900">{formatCurrency(total)}</p>
      </Card>

      <Card className="p-4">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <div className="lg:col-span-2">
            <Label htmlFor="q">Search</Label>
            <Input id="q" name="q" defaultValue={q} placeholder="Description, payee, reference…" />
          </div>
          <div>
            <Label htmlFor="categoryId">Category</Label>
            <Select id="categoryId" name="categoryId" defaultValue={categoryId}>
              <option value="">All Categories</option>
              {filterCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {!c.active ? " (Inactive)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="method">Payment Method</Label>
            <Select id="method" name="method" defaultValue={method}>
              <option value="">All Methods</option>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="GCASH">GCash</option>
              <option value="MAYA">Maya</option>
              <option value="CHEQUE">Cheque</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={from} />
            </div>
            <div>
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={to} />
            </div>
          </div>
          <div className="flex gap-2 lg:col-span-5">
            <Button type="submit" variant="outline">
              Apply Filters
            </Button>
            {(q || categoryId || method || from || to) && (
              <Link href="/admin/expenses">
                <Button type="button" variant="ghost">
                  Clear
                </Button>
              </Link>
            )}
          </div>
        </form>
      </Card>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Expense #</TH>
              <TH>Category</TH>
              <TH>Description</TH>
              <TH>Paid To</TH>
              <TH>Amount</TH>
              <TH>Method</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {expenses.map((e) => (
              <TR key={e.id}>
                <TD className="text-sm text-slate-500">{formatDate(e.expenseDate)}</TD>
                <TD className="font-medium text-slate-900">{e.expenseNumber}</TD>
                <TD className="text-sm text-slate-600">{e.category.name}</TD>
                <TD className="text-sm text-slate-700">
                  {e.description}
                  {e.referenceNumber && <span className="block text-xs text-slate-400">Ref: {e.referenceNumber}</span>}
                </TD>
                <TD className="text-sm text-slate-600">{e.payee ?? "—"}</TD>
                <TD className="font-medium text-slate-900">{formatCurrency(e.amount.toString())}</TD>
                <TD className="text-sm text-slate-500">{e.paymentMethod.replace(/_/g, " ")}</TD>
                <TD>
                  {canManage && (
                    <div className="flex items-center gap-3">
                      <Link href={`/admin/expenses/${e.id}/edit`} className="text-sm font-medium text-brand-600 underline">
                        Edit
                      </Link>
                      <DeleteExpenseButton expenseId={e.id} expenseNumber={e.expenseNumber} />
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {expenses.length === 0 && <EmptyState label="No expenses recorded yet." />}
      </Card>
    </div>
  );
}
