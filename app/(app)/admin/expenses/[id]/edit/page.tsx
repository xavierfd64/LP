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
    prisma.operatingExpense.findUnique({ where: { id } }),
    prisma.expenseCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!expense) notFound();

  return (
    <EditorShell className="max-w-3xl">
      <EditorHeader eyebrow="Expense" title={expense.expenseNumber} subtitle="Edit this operating expense." />
      <ExpenseForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
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
