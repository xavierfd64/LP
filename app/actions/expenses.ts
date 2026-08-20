"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions-guard";
import { nextExpenseNumber } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";

const expenseSchema = z.object({
  expenseDate: z.string().min(1, "Expense date is required."),
  categoryId: z.string().min(1, "Please select a category."),
  description: z.string().min(1, "Description is required."),
  payee: z.string().optional(),
  amount: z.coerce.number().positive("Enter a valid amount."),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "GCASH", "MAYA", "CHEQUE", "OTHER"]),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

function parseExpenseForm(formData: FormData) {
  return expenseSchema.safeParse({
    expenseDate: formData.get("expenseDate"),
    categoryId: formData.get("categoryId"),
    description: formData.get("description"),
    payee: formData.get("payee") || undefined,
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod"),
    referenceNumber: formData.get("referenceNumber") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

export async function createExpenseAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("EXPENSE_MANAGE");

  const parsed = parseExpenseForm(formData);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;

  const category = await prisma.expenseCategory.findUnique({ where: { id: data.categoryId } });
  if (!category || !category.active) return "Please select a valid category.";

  const expenseNumber = await nextExpenseNumber();
  const expense = await prisma.operatingExpense.create({
    data: {
      expenseNumber,
      expenseDate: new Date(data.expenseDate),
      categoryId: data.categoryId,
      description: data.description,
      payee: data.payee,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      referenceNumber: data.referenceNumber,
      notes: data.notes,
      createdById: user.id,
    },
  });

  await logAudit(user.id, "EXPENSE_CREATED", "OperatingExpense", expense.id, {
    expenseNumber,
    category: category.name,
    amount: data.amount,
  });

  redirect("/admin/expenses");
}

export async function updateExpenseAction(expenseId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("EXPENSE_MANAGE");

  const parsed = parseExpenseForm(formData);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;

  const category = await prisma.expenseCategory.findUnique({ where: { id: data.categoryId } });
  if (!category || !category.active) return "Please select a valid category.";

  await prisma.operatingExpense.update({
    where: { id: expenseId },
    data: {
      expenseDate: new Date(data.expenseDate),
      categoryId: data.categoryId,
      description: data.description,
      payee: data.payee || null,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      referenceNumber: data.referenceNumber || null,
      notes: data.notes || null,
    },
  });

  await logAudit(user.id, "EXPENSE_UPDATED", "OperatingExpense", expenseId, {
    category: category.name,
    amount: data.amount,
  });

  redirect("/admin/expenses");
}

/**
 * Deletion must not happen silently (spec item 6) — the confirmation
 * itself lives client-side (a real confirm dialog, see delete-expense-
 * button.tsx), this action is just the guarded, audit-logged mutation it
 * calls after the user confirms.
 */
export async function deleteExpenseAction(expenseId: string) {
  const user = await requirePermission("EXPENSE_MANAGE");
  const expense = await prisma.operatingExpense.findUniqueOrThrow({ where: { id: expenseId } });

  await prisma.operatingExpense.delete({ where: { id: expenseId } });

  await logAudit(user.id, "EXPENSE_DELETED", "OperatingExpense", expenseId, {
    expenseNumber: expense.expenseNumber,
    amount: Number(expense.amount),
  });

  redirect("/admin/expenses");
}

const categorySchema = z.object({
  name: z.string().min(2, "Category name is required."),
});

export async function createExpenseCategoryAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("EXPENSE_MANAGE");

  const parsed = categorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const existing = await prisma.expenseCategory.findUnique({ where: { name: parsed.data.name } });
  if (existing) return "A category with that name already exists.";

  const category = await prisma.expenseCategory.create({ data: { name: parsed.data.name } });
  await logAudit(user.id, "EXPENSE_CATEGORY_CREATED", "ExpenseCategory", category.id, { name: category.name });

  redirect("/admin/expense-categories");
}

export async function toggleExpenseCategoryActiveAction(categoryId: string) {
  const user = await requirePermission("EXPENSE_MANAGE");
  const category = await prisma.expenseCategory.findUniqueOrThrow({ where: { id: categoryId } });

  await prisma.expenseCategory.update({ where: { id: categoryId }, data: { active: !category.active } });
  await logAudit(user.id, "EXPENSE_CATEGORY_TOGGLED", "ExpenseCategory", categoryId, { active: !category.active });

  redirect("/admin/expense-categories");
}
