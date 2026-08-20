import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { EditorShell, EditorHeader } from "@/components/documents/editor-shell";
import { ExpenseForm } from "../../expense-form";

export default async function EditExpensePage({ params }: PageProps<"/admin/expenses/[id]/edit">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "EXPENSE_MANAGE"))) redirect("/admin/expenses");

  const { id } = await params;
  const [expense, categories] = await Promise.all([
    prisma.operatingExpense.findUnique({ where: { id }, include: { category: true } }),
    prisma.expenseCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!expense) notFound();

  // The dropdown must offer every active category plus, if this expense's
  // own category has since been deactivated, that category too — editing
  // an old expense must never silently disconnect it from its category
  // (spec Part B item 5).
  const categoryOptions = categories.some((c) => c.id === expense.categoryId)
    ? categories
    : [...categories, expense.category].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <EditorShell className="max-w-3xl">
      <EditorHeader eyebrow="Expense" title={expense.expenseNumber} subtitle="Edit this operating expense." />
      <ExpenseForm
        categories={categoryOptions.map((c) => ({ id: c.id, name: c.name, active: c.active }))}
        expense={{
          id: expense.id,
          expenseDate: expense.expenseDate.toISOString().slice(0, 10),
          categoryId: expense.categoryId,
          description: expense.description,
          payee: expense.payee,
          amount: Number(expense.amount),
          paymentMethod: expense.paymentMethod,
          referenceNumber: expense.referenceNumber,
          notes: expense.notes,
        }}
      />
    </EditorShell>
  );
}
