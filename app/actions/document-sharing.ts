"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { generateSecureToken } from "@/lib/order-tracking";
import { shareLinkWhereForDoc, ownerCustomerIdForDoc, type ShareDocType } from "@/lib/document-sharing";
import { logAudit } from "@/lib/audit";

const expirySchema = z.object({
  expiresOption: z.enum(["none", "7", "30", "custom"]),
  customDate: z.string().optional(),
  // Optional: the Customer self-service form never renders this field at
  // all (self-service sharing is always View Only, enforced below), so
  // formData.get("accessLevel") is null for that submission — requiring
  // the key would make every customer share silently fail validation.
  accessLevel: z.enum(["VIEW_ONLY", "VIEW_DOWNLOAD"]).optional(),
});

function resolveExpiresAt(input: z.infer<typeof expirySchema>): Date | null {
  if (input.expiresOption === "none") return null;
  if (input.expiresOption === "7") return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (input.expiresOption === "30") return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return input.customDate ? new Date(input.customDate) : null;
}

/**
 * Admin/authorized-Staff can share any document; a logged-in Customer may
 * only share a document that belongs to their own transactions — enforced
 * here server-side, not just by which button the frontend happens to show.
 */
async function assertCanShare(docType: ShareDocType, docId: string) {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  if (user.role === "STAFF") {
    if (!(await can(user, "DOCUMENT_SHARE"))) throw new Error("You do not have permission to share documents.");
    return user;
  }
  if (user.role === "CUSTOMER") {
    const customer = await getCurrentCustomer(user.id);
    const ownerId = await ownerCustomerIdForDoc(docType, docId);
    if (ownerId !== customer.id) throw new Error("You can only share your own documents.");
    return user;
  }
  throw new Error("Not allowed.");
}

export async function generateDocumentShareLinkAction(docType: ShareDocType, docId: string, formData: FormData) {
  const user = await assertCanShare(docType, docId);

  const parsed = expirySchema.safeParse({
    expiresOption: formData.get("expiresOption"),
    customDate: formData.get("customDate") || undefined,
    accessLevel: formData.get("accessLevel") || undefined,
  });
  if (!parsed.success) return;

  // A Customer sharing their own document may never grant PDF download —
  // that's an Admin/authorized-Staff decision only.
  const accessLevel = user.role === "CUSTOMER" ? "VIEW_ONLY" : (parsed.data.accessLevel ?? "VIEW_ONLY");

  const token = generateSecureToken();
  await prisma.documentShareLink.create({
    data: {
      token,
      ...shareLinkWhereForDoc(docType, docId),
      accessLevel,
      createdById: user.id,
      expiresAt: resolveExpiresAt(parsed.data),
    },
  });

  await logAudit(user.id, "DOCUMENT_SHARE_LINK_GENERATED", docType, docId, { accessLevel });
  revalidateForDoc(docType, docId);
}

export async function revokeDocumentShareLinkAction(linkId: string) {
  const link = await prisma.documentShareLink.findUniqueOrThrow({ where: { id: linkId } });
  const docType: ShareDocType = link.quotationId ? "QUOTATION" : link.orderId ? "INVOICE" : "JOB_ORDER";
  const docId = link.quotationId ?? link.orderId ?? link.jobOrderId!;
  const user = await assertCanShare(docType, docId);
  if (user.role === "STAFF" && !(await can(user, "DOCUMENT_REVOKE")) && link.createdById !== user.id) {
    throw new Error("You do not have permission to revoke this link.");
  }

  await prisma.documentShareLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
  await logAudit(user.id, "DOCUMENT_SHARE_LINK_REVOKED", docType, docId, {});
  revalidateForDoc(docType, docId);
}

export async function regenerateDocumentShareLinkAction(docType: ShareDocType, docId: string, formData: FormData) {
  const user = await assertCanShare(docType, docId);

  const parsed = expirySchema.safeParse({
    expiresOption: formData.get("expiresOption"),
    customDate: formData.get("customDate") || undefined,
    accessLevel: formData.get("accessLevel") || undefined,
  });
  if (!parsed.success) return;
  const accessLevel = user.role === "CUSTOMER" ? "VIEW_ONLY" : (parsed.data.accessLevel ?? "VIEW_ONLY");

  await prisma.documentShareLink.updateMany({
    where: { ...shareLinkWhereForDoc(docType, docId), revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const token = generateSecureToken();
  await prisma.documentShareLink.create({
    data: {
      token,
      ...shareLinkWhereForDoc(docType, docId),
      accessLevel,
      createdById: user.id,
      expiresAt: resolveExpiresAt(parsed.data),
    },
  });

  await logAudit(user.id, "DOCUMENT_SHARE_LINK_REGENERATED", docType, docId, { accessLevel });
  revalidateForDoc(docType, docId);
}

function revalidateForDoc(docType: ShareDocType, docId: string) {
  if (docType === "QUOTATION") revalidatePath(`/quotations/${docId}`);
  else if (docType === "INVOICE") revalidatePath(`/orders/${docId}`);
  else revalidatePath(`/job-orders/${docId}`);
}
