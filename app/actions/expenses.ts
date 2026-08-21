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

  const existing = await prisma.operatingExpense.findUniqueOrThrow({ where: { id: expenseId } });
  if (existing.voidedAt) return "This expense has been voided and can no longer be edited.";

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
 * Void, never delete (security hardening pass #2, M20/section 20) — a
 * financial record must stay auditable after the fact, exactly like the
 * cancelledAt/cancelledById pattern already used by SupplyLot and
 * JobOrderMaterialConsumption elsewhere in this app. Previously this ran a
 * hard `prisma.operatingExpense.delete`, which destroyed the row entirely:
 * historical P&L figures that had already counted it would silently no
 * longer be reproducible, and the only trace left behind was a separate
 * AuditLog entry most screens never cross-reference. Voiding instead keeps
 * the row (and its dollar amount) permanently visible in the Expenses list
 * and excluded from every financial total (lib/financial-summary.ts).
 * Confirmation still lives client-side (a real confirm dialog, see
 * void-expense-button.tsx), this action is the guarded, audit-logged
 * mutation it calls after the user confirms.
 */
export async function voidExpenseAction(expenseId: string) {
  const user = await requirePermission("EXPENSE_MANAGE");
  const expense = await prisma.operatingExpense.findUniqueOrThrow({ where: { id: expenseId } });
  if (expense.voidedAt) return; // already voided — nothing to do

  await prisma.operatingExpense.update({
    where: { id: expenseId },
    data: { voidedAt: new Date(), voidedById: user.id },
  });

  await logAudit(user.id, "EXPENSE_VOIDED", "OperatingExpense", expenseId, {
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
