"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";
import { notifyStaff, notifyCustomer } from "@/lib/notifications";
import { generateSecureToken } from "@/lib/order-tracking";
import { formLinkUrl, findActiveFormLink, attemptFormDelivery } from "@/lib/customer-form";

async function requireFormPermission(permission: "FORM_VIEW" | "FORM_CREATE" | "FORM_MANAGE_LINK" | "FORM_EDIT" | "FORM_REOPEN" | "FORM_ITEM_UNLOCK_OVERRIDE") {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) throw new Error("Not allowed.");
  if (user.role === "ADMIN") return user;
  if (!(await can(user, permission))) throw new Error("You do not have permission to do that.");
  return user;
}

function revalidateForm(formId: string) {
  revalidatePath(`/forms/${formId}`);
}

// ---------------------------------------------------------------------------
// Create + generate link + auto-deliver (spec 1.1-1.2, implementation order 1-3)
// ---------------------------------------------------------------------------

const createFormSchema = z.object({
  title: z.string().min(1, "Please provide a form title."),
  instructions: z.string().optional(),
  deadline: z.string().optional(),
  starterQty: z.coerce.number().int().positive().default(1),
});

export async function createCustomerFormAction(jobOrderId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireFormPermission("FORM_CREATE");

  const existing = await prisma.customerForm.findUnique({ where: { jobOrderId } });
  if (existing) return "A customer form already exists for this job order.";

  const jobOrder = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    include: { order: { include: { customer: true } }, service: true },
  });
  if (!jobOrder) return "Job order not found.";

  const parsed = createFormSchema.safeParse({
    title: formData.get("title"),
    instructions: formData.get("instructions") || undefined,
    deadline: formData.get("deadline") || undefined,
    starterQty: formData.get("starterQty") || jobOrder.quantity,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const form = await prisma.customerForm.create({
    data: {
      jobOrderId: jobOrder.id,
      orderId: jobOrder.orderId,
      customerId: jobOrder.order.customerId,
      formType: jobOrder.service?.name ?? jobOrder.productType,
      title: parsed.data.title,
      instructions: parsed.data.instructions,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
      createdById: user.id,
      items: {
        create: [{ sortOrder: 0, name: "", qty: parsed.data.starterQty }],
      },
    },
  });

  const token = generateSecureToken();
  await prisma.customerFormLink.create({
    data: { token, formId: form.id, createdById: user.id, expiresAt: parsed.data.deadline ? new Date(parsed.data.deadline) : null },
  });

  await logAudit(user.id, "FORM_CREATED", "CustomerForm", form.id, { jobOrderId: jobOrder.id, title: parsed.data.title });
  await logAudit(user.id, "FORM_LINK_GENERATED", "CustomerForm", form.id, {});

  const link = formLinkUrl(token);
  const message = `Please fill out your ${form.title} for Job Order ${jobOrder.joNumber}.`;
  const customer = jobOrder.order.customer;

  const emailOutcome = await attemptFormDelivery(form.id, "EMAIL", { customerId: customer.id, customerEmail: customer.email, message, link, deliveredById: user.id });
  const messengerOutcome = await attemptFormDelivery(form.id, "MESSENGER", { customerId: customer.id, customerEmail: customer.email, message, link, deliveredById: user.id });
  await logAudit(user.id, "FORM_LINK_SENT", "CustomerForm", form.id, { email: emailOutcome.status, messenger: messengerOutcome.status });

  await notifyStaff("FORM_CREATED", `Customer form "${form.title}" created for ${jobOrder.joNumber} and sent to ${customer.name}.`, `/forms/${form.id}`);
  if (emailOutcome.status === "FAILED" && messengerOutcome.status === "FAILED") {
    await notifyStaff("FORM_LINK_DELIVERY_FAILED", `Automatic delivery of the form link for ${jobOrder.joNumber} failed on both Email and Messenger — please share it manually.`, `/forms/${form.id}`);
  }

  redirect(`/forms/${form.id}`);
}

// ---------------------------------------------------------------------------
// Link delivery management (spec 2.2, 8)
// ---------------------------------------------------------------------------

export async function resendFormLinkAction(formId: string, method: "EMAIL" | "MESSENGER") {
  const user = await requireFormPermission("FORM_MANAGE_LINK");
  const form = await prisma.customerForm.findUniqueOrThrow({ where: { id: formId }, include: { customer: true, jobOrder: true } });
  const activeLink = await findActiveFormLink(formId);
  if (!activeLink) return "No active link to resend. Regenerate a link first.";

  const link = formLinkUrl(activeLink.token);
  const message = `Please fill out your ${form.title} for Job Order ${form.jobOrder.joNumber}.`;
  const outcome = await attemptFormDelivery(formId, method, {
    customerId: form.customerId,
    customerEmail: form.customer.email,
    message,
    link,
    deliveredById: user.id,
  });
  await logAudit(user.id, "FORM_LINK_SENT", "CustomerForm", formId, { method, status: outcome.status, resend: true });
  if (outcome.status === "FAILED") {
    await notifyStaff("FORM_LINK_DELIVERY_FAILED", `Resending the form link for ${form.jobOrder.joNumber} via ${method} failed: ${outcome.detail ?? "unknown error"}.`, `/forms/${formId}`);
  }
  revalidateForm(formId);
  return outcome.status === "FAILED" ? (outcome.detail ?? "Delivery failed.") : undefined;
}

export async function recordLinkCopiedAction(formId: string) {
  const user = await requireFormPermission("FORM_MANAGE_LINK");
  const activeLink = await findActiveFormLink(formId);
  await prisma.customerFormDelivery.create({
    data: { formId, method: "DIRECT_LINK", recipient: activeLink ? formLinkUrl(activeLink.token) : "—", deliveredById: user.id, status: "COPIED" },
  });
  await logAudit(user.id, "FORM_LINK_COPIED", "CustomerForm", formId, {});
  revalidateForm(formId);
}

export async function regenerateFormLinkAction(formId: string) {
  const user = await requireFormPermission("FORM_MANAGE_LINK");
  const form = await prisma.customerForm.findUniqueOrThrow({ where: { id: formId } });

  await prisma.customerFormLink.updateMany({ where: { formId, revokedAt: null }, data: { revokedAt: new Date() } });
  const token = generateSecureToken();
  await prisma.customerFormLink.create({
    data: { token, formId, createdById: user.id, expiresAt: form.deadline ?? null },
  });

  await logAudit(user.id, "FORM_LINK_REGENERATED", "CustomerForm", formId, {});
  revalidateForm(formId);
}

// ---------------------------------------------------------------------------
// Admin/Staff reopen (spec 2.4)
// ---------------------------------------------------------------------------

export async function reopenCustomerFormAction(formId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireFormPermission("FORM_REOPEN");
  const reason = (formData.get("reason") as string | null)?.trim();
  if (!reason) return "Please provide a reason for reopening this form.";

  const form = await prisma.customerForm.findUniqueOrThrow({ where: { id: formId }, include: { jobOrder: true } });
  if (form.status !== "SUBMITTED") return "Only a submitted, locked form can be reopened.";

  await prisma.customerForm.update({
    where: { id: formId },
    data: { status: "OPEN", lastReopenedAt: new Date(), lastReopenedById: user.id, lastReopenReason: reason },
  });

  await logAudit(user.id, "FORM_REOPENED", "CustomerForm", formId, { reason });
  await notifyStaff("FORM_REOPENED", `${user.name ?? "A staff member"} reopened the customer form for ${form.jobOrder.joNumber}: ${reason}`, `/forms/${formId}`);
  await notifyCustomer(form.customerId, "FORM_REOPENED", `Your ${form.title} has been reopened for editing. Please review and resubmit.`, undefined);

  revalidateForm(formId);
  redirect(`/forms/${formId}`);
}

// ---------------------------------------------------------------------------
// Add Items (spec 7.1)
// ---------------------------------------------------------------------------

const itemRowSchema = z.object({
  name: z.string().min(1, "Please provide a name/label for every item."),
  qty: z.coerce.number().int().positive(),
  notes: z.string().optional(),
  specs: z.record(z.string(), z.string()).optional(),
});

export async function addFormItemsAction(formId: string, formData: FormData) {
  const user = await requireFormPermission("FORM_EDIT");
  const form = await prisma.customerForm.findUniqueOrThrow({ where: { id: formId }, include: { jobOrder: true, items: true } });

  let rawItems: unknown;
  try {
    rawItems = JSON.parse((formData.get("itemsJson") as string) || "[]");
  } catch {
    return "Invalid items.";
  }
  const parsed = z.array(itemRowSchema).min(1).safeParse(rawItems);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid items.";

  const startOrder = form.items.length;
  await prisma.customerFormItem.createMany({
    data: parsed.data.map((it, i) => ({ formId, sortOrder: startOrder + i, name: it.name, qty: it.qty, notes: it.notes, specs: it.specs ?? {} })),
  });

  await logAudit(user.id, "FORM_ITEM_ADDED", "CustomerForm", formId, { count: parsed.data.length });
  await notifyStaff("FORM_ITEM_ADDED", `${parsed.data.length} item(s) added to the customer form for ${form.jobOrder.joNumber}.`, `/forms/${formId}`);
  await notifyCustomer(form.customerId, "FORM_ITEM_ADDED", `New items were added to your ${form.title}. Please review.`, undefined);

  revalidateForm(formId);
}

const editItemSchema = z.object({
  name: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  notes: z.string().optional(),
  specs: z.record(z.string(), z.string()).optional(),
});

export async function editFormItemAction(itemId: string, formData: FormData) {
  const user = await requireFormPermission("FORM_EDIT");
  const item = await prisma.customerFormItem.findUniqueOrThrow({ where: { id: itemId }, include: { form: true } });
  if (item.printed) return "This item has already been printed and can no longer be edited.";

  let specs: unknown = {};
  try {
    specs = JSON.parse((formData.get("specsJson") as string) || "{}");
  } catch {
    specs = {};
  }
  const parsed = editItemSchema.safeParse({
    name: formData.get("name"),
    qty: formData.get("qty"),
    notes: formData.get("notes") || undefined,
    specs,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  await prisma.customerFormItem.update({
    where: { id: itemId },
    data: { name: parsed.data.name, qty: parsed.data.qty, notes: parsed.data.notes, specs: parsed.data.specs ?? {} },
  });

  await logAudit(user.id, "FORM_ITEM_EDITED", "CustomerForm", item.formId, { itemId });
  revalidateForm(item.formId);
}

export async function deleteFormItemAction(itemId: string) {
  const user = await requireFormPermission("FORM_EDIT");
  const item = await prisma.customerFormItem.findUniqueOrThrow({ where: { id: itemId } });
  if (item.printed) return "This item has already been printed and can no longer be deleted.";

  await prisma.customerFormItem.delete({ where: { id: itemId } });
  await logAudit(user.id, "FORM_ITEM_DELETED", "CustomerForm", item.formId, { itemId, name: item.name });
  revalidateForm(item.formId);
}

// ---------------------------------------------------------------------------
// Printed item lock (spec 6, 11)
// ---------------------------------------------------------------------------

export async function markItemPrintedAction(itemId: string) {
  const user = await requireFormPermission("FORM_EDIT");
  const item = await prisma.customerFormItem.findUniqueOrThrow({ where: { id: itemId }, include: { form: { include: { jobOrder: true } } } });
  if (item.printed) return;

  await prisma.customerFormItem.update({ where: { id: itemId }, data: { printed: true, printedAt: new Date(), printedById: user.id } });
  await logAudit(user.id, "FORM_ITEM_PRINTED", "CustomerForm", item.formId, { itemId, name: item.name });
  await notifyStaff("FORM_ITEM_PRINTED", `Item "${item.name}" for ${item.form.jobOrder.joNumber} was marked printed and is now locked.`, `/forms/${item.formId}`);
  revalidateForm(item.formId);
}

export async function unlockPrintedItemAction(itemId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireFormPermission("FORM_ITEM_UNLOCK_OVERRIDE");
  const reason = (formData.get("reason") as string | null)?.trim();
  if (!reason) return "Please provide a reason for this override.";

  const item = await prisma.customerFormItem.findUniqueOrThrow({ where: { id: itemId } });
  if (!item.printed) return "This item is not locked.";

  await prisma.customerFormItem.update({ where: { id: itemId }, data: { printed: false, printedAt: null, printedById: null } });
  await logAudit(user.id, "FORM_ITEM_UNLOCK_OVERRIDE", "CustomerForm", item.formId, { itemId, name: item.name, reason });
  revalidateForm(item.formId);
  redirect(`/forms/${item.formId}`);
}

// ---------------------------------------------------------------------------
// Add Order (spec 7.2)
// ---------------------------------------------------------------------------

export async function searchAttachableOrdersAction(formId: string, query: string) {
  await requireFormPermission("FORM_VIEW");
  const form = await prisma.customerForm.findUniqueOrThrow({ where: { id: formId }, include: { additionalOrders: true } });
  const excludeIds = [form.orderId, ...form.additionalOrders.map((a) => a.orderId)];

  const q = query.trim();
  const orders = await prisma.order.findMany({
    where: {
      customerId: form.customerId,
      id: { notIn: excludeIds },
      ...(q ? { orderNumber: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, totalAmount: o.totalAmount.toString() }));
}

export async function addOrderToFormAction(formId: string, formData: FormData) {
  const user = await requireFormPermission("FORM_EDIT");
  const orderId = formData.get("orderId") as string;
  const note = (formData.get("note") as string) || undefined;
  if (!orderId) return "Please select an order to attach.";

  const form = await prisma.customerForm.findUniqueOrThrow({ where: { id: formId }, include: { jobOrder: true } });
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== form.customerId) return "That order does not belong to this form's customer.";

  await prisma.customerFormOrder.create({ data: { formId, orderId, addedById: user.id, note } });
  await logAudit(user.id, "FORM_ORDER_ADDED", "CustomerForm", formId, { orderId, orderNumber: order.orderNumber });
  await notifyStaff("FORM_ORDER_ADDED", `Order ${order.orderNumber} was attached to the customer form for ${form.jobOrder.joNumber}.`, `/forms/${formId}`);
  await notifyCustomer(form.customerId, "FORM_ORDER_ADDED", `Order ${order.orderNumber} was added to your ${form.title}.`, undefined);

  revalidateForm(formId);
}
