"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { saveUploadedFile, UploadRejectedError } from "@/lib/upload";
import { logAudit } from "@/lib/audit";
import { notifyCustomer } from "@/lib/notifications";

const FILE_CATEGORIES = [
  "CUSTOMER_FILE",
  "DESIGN_DRAFT",
  "APPROVED_DESIGN",
  "PRODUCTION_FILE",
  "QC_EVIDENCE",
] as const;
type FileCategory = (typeof FILE_CATEGORIES)[number];

export async function uploadJobOrderFileAction(jobOrderId: string, formData: FormData) {
  const user = await requireUser();
  const category = formData.get("category") as FileCategory;
  const file = formData.get("file") as File | null;

  if (!FILE_CATEGORIES.includes(category)) {
    redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent("Invalid file category.")}`);
  }
  if (!file || file.size === 0) {
    redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent("Please choose a file to upload.")}`);
  }

  const jo = await prisma.jobOrder.findUniqueOrThrow({ where: { id: jobOrderId }, include: { order: true } });

  if (user.role === "CUSTOMER") {
    const customer = await getCurrentCustomer(user.id);
    if (jo.order.customerId !== customer.id) throw new Error("Not allowed.");
    if (category !== "CUSTOMER_FILE") {
      redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent("Customers can only upload customer files.")}`);
    }
  }

  let saved: { filename: string; path: string };
  try {
    saved = await saveUploadedFile(file, "document");
  } catch (e) {
    if (e instanceof UploadRejectedError) {
      redirect(`/job-orders/${jobOrderId}?error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
  const existingCount = await prisma.file.count({ where: { jobOrderId, category } });

  const created = await prisma.file.create({
    data: {
      jobOrderId,
      uploadedById: user.id,
      category,
      version: existingCount + 1,
      filename: saved.filename,
      path: saved.path,
    },
  });

  await logAudit(user.id, "FILE_UPLOADED", "File", created.id, { jobOrderId, category, version: created.version });
  if (category === "DESIGN_DRAFT") {
    await notifyCustomer(
      jo.order.customerId,
      "DESIGN_DRAFT_UPLOADED",
      `A new design draft is ready for your review on JO ${jo.joNumber}.`,
      `/job-orders/${jobOrderId}`
    );
  }

  redirect(`/job-orders/${jobOrderId}`);
}

export async function approveFileAction(fileId: string) {
  const user = await requireUser();
  const file = await prisma.file.findUniqueOrThrow({
    where: { id: fileId },
    include: { jobOrder: { include: { order: true } } },
  });

  if (user.role === "CUSTOMER") {
    const customer = await getCurrentCustomer(user.id);
    if (!file.jobOrder || file.jobOrder.order.customerId !== customer.id) throw new Error("Not allowed.");
    if (file.category !== "DESIGN_DRAFT") throw new Error("Customers can only approve design drafts.");
  } else if (user.role !== "STAFF" && user.role !== "ADMIN" && user.role !== "PRODUCTION") {
    throw new Error("Not allowed.");
  }

  await prisma.$transaction([
    prisma.file.updateMany({
      where: { jobOrderId: file.jobOrderId, category: file.category },
      data: { isApproved: false },
    }),
    prisma.file.update({ where: { id: fileId }, data: { isApproved: true } }),
  ]);

  await logAudit(user.id, "FILE_APPROVED", "File", fileId, { jobOrderId: file.jobOrderId, category: file.category });

  redirect(`/job-orders/${file.jobOrderId}`);
}
