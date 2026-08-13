"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { nextQuoteNumber } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";

const lineItemsSchema = z.array(
  z.object({
    productType: z.string().min(1),
    description: z.string().min(1),
    qty: z.coerce.number().int().positive(),
    unitPrice: z.coerce.number().nonnegative(),
  })
);

export async function createQuotationAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["STAFF", "ADMIN"]);

  const customerId = String(formData.get("customerId") ?? "");
  const inquiryId = (formData.get("inquiryId") as string) || undefined;
  const validUntilRaw = formData.get("validUntil") as string | null;
  const notesRaw = (formData.get("notes") as string) || undefined;

  const productTypes = formData.getAll("productType") as string[];
  const descriptions = formData.getAll("description") as string[];
  const qtys = formData.getAll("qty") as string[];
  const unitPrices = formData.getAll("unitPrice") as string[];

  const rawItems = productTypes.map((_, i) => ({
    productType: productTypes[i],
    description: descriptions[i],
    qty: qtys[i],
    unitPrice: unitPrices[i],
  }));

  const parsedItems = lineItemsSchema.safeParse(rawItems);
  if (!customerId) return "Please select a customer.";
  if (!parsedItems.success || parsedItems.data.length === 0) {
    return "Please provide at least one valid line item.";
  }

  const total = parsedItems.data.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
  const quoteNumber = await nextQuoteNumber();

  const quotation = await prisma.quotation.create({
    data: {
      quoteNumber,
      customerId,
      inquiryId,
      status: "DRAFT",
      validUntil: validUntilRaw ? new Date(validUntilRaw) : undefined,
      notes: notesRaw,
      total,
      lineItems: { create: parsedItems.data },
    },
  });

  if (inquiryId) {
    await prisma.inquiry.update({ where: { id: inquiryId }, data: { status: "QUOTED" } });
  }

  await logAudit(user.id, "QUOTATION_CREATED", "Quotation", quotation.id, { total });

  redirect(`/quotations/${quotation.id}`);
}

export async function sendQuotationAction(quotationId: string) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  await prisma.quotation.update({ where: { id: quotationId }, data: { status: "SENT" } });
  await logAudit(user.id, "QUOTATION_SENT", "Quotation", quotationId);
  notify("customer", `Your quotation is ready for review.`);
  redirect(`/quotations/${quotationId}`);
}

export async function approveQuotationAction(quotationId: string) {
  const user = await requireUser();
  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } });

  if (user.role === "CUSTOMER") {
    const customer = await getCurrentCustomer(user.id);
    if (quotation.customerId !== customer.id) throw new Error("Not allowed.");
  } else if (user.role !== "ADMIN" && user.role !== "STAFF") {
    throw new Error("Not allowed.");
  }

  await prisma.quotation.update({ where: { id: quotationId }, data: { status: "APPROVED" } });
  await logAudit(user.id, "QUOTATION_APPROVED", "Quotation", quotationId);
  redirect(`/quotations/${quotationId}`);
}

export async function rejectQuotationAction(quotationId: string) {
  const user = await requireUser();
  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } });

  if (user.role === "CUSTOMER") {
    const customer = await getCurrentCustomer(user.id);
    if (quotation.customerId !== customer.id) throw new Error("Not allowed.");
  } else if (user.role !== "ADMIN" && user.role !== "STAFF") {
    throw new Error("Not allowed.");
  }

  await prisma.quotation.update({ where: { id: quotationId }, data: { status: "REJECTED" } });
  await logAudit(user.id, "QUOTATION_REJECTED", "Quotation", quotationId);
  redirect(`/quotations/${quotationId}`);
}
