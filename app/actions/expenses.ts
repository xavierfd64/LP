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

// Trimmed, non-blank, reasonably bounded (spec Part B item 18).
const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Category name is required.")
    .max(60, "Category name is too long (60 characters max)."),
  description: z.string().trim().max(300, "Description is too long (300 characters max).").optional(),
  active: z.enum(["true", "false"]).default("true"),
});

function parseCategoryForm(formData: FormData) {
  return categorySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    active: formData.get("active") ?? "true",
  });
}

/**
 * Case-insensitive, whitespace-normalized duplicate check (spec Part B
 * item 17) — "Electricity & Utilities" and "electricity & utilities  "
 * are the same category. `excludeId` lets an edit save without tripping
 * over its own name.
 */
async function findDuplicateCategory(name: string, excludeId?: string) {
  return prisma.expenseCategory.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

export async function createExpenseCategoryAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("EXPENSE_MANAGE");

  const parsed = parseCategoryForm(formData);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;

  if (await findDuplicateCategory(data.name)) return "An expense category with this name already exists.";

  const category = await prisma.expenseCategory.create({
    data: { name: data.name, description: data.description || null, active: data.active === "true" },
  });
  await logAudit(user.id, "EXPENSE_CATEGORY_CREATED", "ExpenseCategory", category.id, {
    name: category.name,
    active: category.active,
  });

  redirect("/admin/expense-categories");
}

/**
 * One save can change both descriptive fields (name/description) and the
 * active status. Each is audited under its own action name (spec Part B
 * item 15 lists them separately: Created/Updated/Activated/Deactivated),
 * so a rename-and-deactivate produces two precise entries rather than one
 * ambiguous one. Editing never touches which expenses point at this
 * category — the categoryId relation on OperatingExpense is untouched.
 */
export async function updateExpenseCategoryAction(categoryId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("EXPENSE_MANAGE");

  const parsed = parseCategoryForm(formData);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  const data = parsed.data;

  const existing = await prisma.expenseCategory.findUniqueOrThrow({ where: { id: categoryId } });
  if (await findDuplicateCategory(data.name, categoryId)) return "An expense category with this name already exists.";

  const nextActive = data.active === "true";
  const description = data.description || null;
  const infoChanged = existing.name !== data.name || existing.description !== description;
  const statusChanged = existing.active !== nextActive;

  await prisma.expenseCategory.update({
    where: { id: categoryId },
    data: { name: data.name, description, active: nextActive },
  });

  if (infoChanged) {
    await logAudit(user.id, "EXPENSE_CATEGORY_UPDATED", "ExpenseCategory", categoryId, {
      name: data.name,
      previousName: existing.name,
    });
  }
  if (statusChanged) {
    await logAudit(user.id, nextActive ? "EXPENSE_CATEGORY_ACTIVATED" : "EXPENSE_CATEGORY_DEACTIVATED", "ExpenseCategory", categoryId, {
      name: data.name,
    });
  }

  redirect("/admin/expense-categories");
}

/**
 * Permanent delete is only ever allowed for a category with zero linked
 * expenses (spec Part B item 6 — "Do not delete categories with
 * history"). A category that has ever been used can only be deactivated.
 * Enforced here server-side, not just hidden in the UI.
 */
export async function deleteExpenseCategoryAction(categoryId: string) {
  const user = await requirePermission("EXPENSE_MANAGE");
  const category = await prisma.expenseCategory.findUniqueOrThrow({
    where: { id: categoryId },
    include: { _count: { select: { expenses: true } } },
  });

  if (category._count.expenses > 0) {
    throw new Error("This category has expense records and cannot be deleted. Deactivate it instead.");
  }

  await prisma.expenseCategory.delete({ where: { id: categoryId } });
  await logAudit(user.id, "EXPENSE_CATEGORY_DELETED", "ExpenseCategory", categoryId, { name: category.name });

  redirect("/admin/expense-categories");
}
