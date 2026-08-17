import { prisma } from "@/lib/prisma";

export type ShareDocType = "QUOTATION" | "INVOICE" | "JOB_ORDER";

/** Which polymorphic FK column on DocumentShareLink a given document type uses — mirrors Message's refQuotationId/refJobOrderId pattern already in this schema. INVOICE shares live on the Order (there's no separate Invoice model; the invoice IS the order). */
export function shareLinkWhereForDoc(docType: ShareDocType, docId: string) {
  switch (docType) {
    case "QUOTATION":
      return { quotationId: docId };
    case "INVOICE":
      return { orderId: docId };
    case "JOB_ORDER":
      return { jobOrderId: docId };
  }
}

export async function findActiveShareLink(docType: ShareDocType, docId: string) {
  return prisma.documentShareLink.findFirst({
    where: { ...shareLinkWhereForDoc(docType, docId), revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

/** Resolves the owning Customer.id for a document, for the "customers may only share their own transactions" self-service rule. */
export async function ownerCustomerIdForDoc(docType: ShareDocType, docId: string): Promise<string | null> {
  if (docType === "QUOTATION") {
    const q = await prisma.quotation.findUnique({ where: { id: docId }, select: { customerId: true } });
    return q?.customerId ?? null;
  }
  if (docType === "INVOICE") {
    const o = await prisma.order.findUnique({ where: { id: docId }, select: { customerId: true } });
    return o?.customerId ?? null;
  }
  const jo = await prisma.jobOrder.findUnique({ where: { id: docId }, select: { order: { select: { customerId: true } } } });
  return jo?.order.customerId ?? null;
}
