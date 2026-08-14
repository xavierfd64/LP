"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { logAudit } from "@/lib/audit";
import { notifyStaff } from "@/lib/notifications";

const inquirySchema = z.object({
  customerId: z.string().optional(),
  description: z.string().min(5, "Please describe what you need."),
  desiredProduct: z.string().min(1, "Product type is required."),
  roughQty: z.coerce.number().int().positive().optional(),
});

export async function createInquiryAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireUser();

  const parsed = inquirySchema.safeParse({
    customerId: formData.get("customerId") || undefined,
    description: formData.get("description"),
    desiredProduct: formData.get("desiredProduct"),
    roughQty: formData.get("roughQty") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  let customerId = parsed.data.customerId;
  if (user.role === "CUSTOMER") {
    const customer = await getCurrentCustomer(user.id);
    customerId = customer.id;
  }
  if (!customerId) return "Please select a customer.";

  const inquiry = await prisma.inquiry.create({
    data: {
      customerId,
      description: parsed.data.description,
      desiredProduct: parsed.data.desiredProduct,
      roughQty: parsed.data.roughQty,
    },
  });

  await logAudit(user.id, "INQUIRY_CREATED", "Inquiry", inquiry.id, { desiredProduct: inquiry.desiredProduct });
  await notifyStaff(
    "INQUIRY_CREATED",
    `New inquiry: ${inquiry.desiredProduct}`,
    `/inquiries/${inquiry.id}`
  );

  redirect(`/inquiries/${inquiry.id}`);
}

export async function closeInquiryAction(inquiryId: string) {
  const user = await requireUser();
  if (user.role !== "STAFF" && user.role !== "ADMIN") throw new Error("Not allowed.");

  await prisma.inquiry.update({ where: { id: inquiryId }, data: { status: "CLOSED" } });
  await logAudit(user.id, "INQUIRY_CLOSED", "Inquiry", inquiryId);
  redirect(`/inquiries/${inquiryId}`);
}

const editInquirySchema = z.object({
  description: z.string().min(5, "Please describe what you need."),
  desiredProduct: z.string().min(1, "Product type is required."),
  roughQty: z.coerce.number().int().positive().optional(),
});

async function assertOwnsEditableInquiry(user: { id: string; role: string }, inquiryId: string) {
  const inquiry = await prisma.inquiry.findUniqueOrThrow({ where: { id: inquiryId } });
  const customer = await getCurrentCustomer(user.id);
  if (inquiry.customerId !== customer.id) throw new Error("Not allowed.");
  if (inquiry.status !== "NEW") {
    redirect(`/inquiries/${inquiryId}?error=${encodeURIComponent("This inquiry can no longer be edited or cancelled — it's already been quoted, closed, or cancelled.")}`);
  }
  return inquiry;
}

export async function updateInquiryAction(inquiryId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");
  await assertOwnsEditableInquiry(user, inquiryId);

  const parsed = editInquirySchema.safeParse({
    description: formData.get("description"),
    desiredProduct: formData.get("desiredProduct"),
    roughQty: formData.get("roughQty") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  await prisma.inquiry.update({
    where: { id: inquiryId },
    data: parsed.data,
  });

  await logAudit(user.id, "INQUIRY_UPDATED", "Inquiry", inquiryId, parsed.data);

  redirect(`/inquiries/${inquiryId}`);
}

export async function cancelInquiryAction(inquiryId: string) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");
  await assertOwnsEditableInquiry(user, inquiryId);

  await prisma.inquiry.update({ where: { id: inquiryId }, data: { status: "CANCELLED" } });
  await logAudit(user.id, "INQUIRY_CANCELLED", "Inquiry", inquiryId);

  redirect(`/inquiries/${inquiryId}`);
}
