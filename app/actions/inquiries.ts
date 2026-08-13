"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";

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
  notify("staff", `New inquiry from customer ${customerId}: ${inquiry.desiredProduct}`);

  redirect(`/inquiries/${inquiry.id}`);
}

export async function closeInquiryAction(inquiryId: string) {
  const user = await requireUser();
  if (user.role !== "STAFF" && user.role !== "ADMIN") throw new Error("Not allowed.");

  await prisma.inquiry.update({ where: { id: inquiryId }, data: { status: "CLOSED" } });
  await logAudit(user.id, "INQUIRY_CLOSED", "Inquiry", inquiryId);
  redirect(`/inquiries/${inquiryId}`);
}
