"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { isActiveQuotationStatus } from "@/lib/quotation-status";

/**
 * Backs the Inquiry Details modal (Aug 22 UI redesign update 2, Part 5) —
 * a read-only summary for the staff/admin Inquiries list's "View" action,
 * which must open a modal instead of navigating to /inquiries/[id]. That
 * full page still exists untouched (edit form, cancel, chatbox — all
 * customer/staff workflows unrelated to "quick-view from the list"); this
 * action returns a smaller shape purpose-built for the modal, but applies
 * the exact same authorization the page itself already enforces.
 */
export type InquiryDetailResult =
  | {
      ok: true;
      data: {
        id: string;
        inquiryNumber: string;
        status: string;
        submittedAt: string;
        customerName: string;
        customerEmail: string | null;
        customerContact: string | null;
        createdBy: string | null;
        desiredProduct: string;
        roughQty: number | null;
        specs: Record<string, string> | null;
        notes: string;
        canCreateQuotation: boolean;
        activeQuotation: { id: string; quoteNumber: string } | null;
      };
    }
  | { ok: false; error: string };

export async function getInquiryDetailAction(id: string): Promise<InquiryDetailResult> {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: { customer: true, quotations: true },
  });
  if (!inquiry) return { ok: false, error: "Inquiry not found." };

  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (inquiry.customerId !== customer.id) return { ok: false, error: "Not authorized." };
  } else if (user.role === "STAFF" && !(await can(user, "INQUIRY_VIEW"))) {
    return { ok: false, error: "Not authorized." };
  }

  const canCreateQuotation = user.role === "ADMIN" || (await can(user, "QUOTATION_CREATE"));
  const activeQuotation = inquiry.quotations.find((q) => isActiveQuotationStatus(q.status));
  const canConvert = inquiry.status !== "CLOSED" && inquiry.status !== "CANCELLED" && !activeQuotation;

  return {
    ok: true,
    data: {
      id: inquiry.id,
      // Inquiries don't have their own display number in this data model —
      // the "customer + product" pairing is what identifies one in every
      // existing list/page, so the modal follows that rather than
      // inventing a numbering scheme.
      inquiryNumber: inquiry.desiredProduct,
      status: inquiry.status,
      submittedAt: inquiry.createdAt.toISOString(),
      customerName: inquiry.customer.name,
      customerEmail: inquiry.customer.email,
      customerContact: inquiry.customer.contactNumber,
      createdBy: null,
      desiredProduct: inquiry.desiredProduct,
      roughQty: inquiry.roughQty,
      specs: (inquiry.specs as Record<string, string> | null) ?? null,
      notes: inquiry.description,
      canCreateQuotation: canCreateQuotation && canConvert,
      activeQuotation: activeQuotation ? { id: activeQuotation.id, quoteNumber: activeQuotation.quoteNumber } : null,
    },
  };
}
