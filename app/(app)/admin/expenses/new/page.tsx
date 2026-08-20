import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { EditorShell, EditorHeader } from "@/components/documents/editor-shell";
import { ExpenseForm } from "../expense-form";

export default async function NewExpensePage() {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "EXPENSE_MANAGE"))) redirect("/admin/expenses");

  const categories = await prisma.expenseCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  return (
    <EditorShell className="max-w-3xl">
      <EditorHeader eyebrow="Expense" title="Record Operating Expense" subtitle="Rent, utilities, salaries, and other business overhead." />
      <ExpenseForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </EditorShell>
  );
}
