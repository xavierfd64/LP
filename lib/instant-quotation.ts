import { prisma } from "@/lib/prisma";
import { nextQuoteNumber } from "@/lib/numbering";
import { calculatePricing } from "@/lib/pricing";
import { logAudit } from "@/lib/audit";
import { notifyCustomer } from "@/lib/notifications";

/**
 * Instant quotation on Inquiry submission (spec Part F/J). Deliberately
 * narrow: it only fires when the Service has a real, valid pricing
 * configuration AND the customer supplied a quantity — otherwise the
 * Inquiry proceeds to the existing, unmodified Staff-review flow (spec
 * item 27). When it does fire, it creates the quotation already SENT
 * (Aug 19 corrective update, item 12) — a computed, complete quotation has
 * nothing left for Staff to review before sending, and the customer's
 * Approve/Reject/Edit actions only render for a SENT quotation, so leaving
 * it at DRAFT silently stranded every auto-generated quotation with no
 * customer-facing action at all. It's otherwise an ordinary quotation
 * through the same path Staff would use by hand (spec item 28: instant
 * pricing never creates a Job Order, never skips Approval/Payment) —
 * `isInstant` just flags how it originated for display purposes.
 */
export async function tryCreateInstantQuotation(inquiry: {
  id: string;
  customerId: string;
  serviceId: string | null;
  desiredProduct: string;
  description: string;
  roughQty: number | null;
  specs: unknown;
}): Promise<{ created: boolean; quotationId?: string }> {
  if (!inquiry.serviceId || !inquiry.roughQty) return { created: false };

  const service = await prisma.service.findUnique({ where: { id: inquiry.serviceId } });
  if (!service || !service.active || !service.instantQuoteEnabled) return { created: false };

  const pricing = await calculatePricing(inquiry.serviceId, inquiry.roughQty);
  if (!pricing.available) return { created: false };

  const quoteNumber = await nextQuoteNumber();
  const quotation = await prisma.quotation.create({
    data: {
      quoteNumber,
      customerId: inquiry.customerId,
      inquiryId: inquiry.id,
      status: "SENT",
      isInstant: true,
      subtotal: pricing.subtotal,
      discountAmount: pricing.totalDiscountAmount,
      discountLabel: [pricing.bulkDiscountLabel, pricing.promoDiscountLabel].filter(Boolean).join(" + ") || null,
      total: pricing.total,
      notes: "Automatically generated instant quotation based on the service's configured pricing.",
      lineItems: {
        create: [
          {
            serviceId: service.id,
            productType: service.name,
            description: inquiry.description,
            qty: inquiry.roughQty,
            unitPrice: pricing.unitPrice,
            specs: (inquiry.specs as Record<string, string> | null) ?? undefined,
          },
        ],
      },
    },
  });

  await prisma.inquiry.update({ where: { id: inquiry.id }, data: { status: "QUOTED" } });
  await logAudit(null, "QUOTATION_INSTANT_CREATED", "Quotation", quotation.id, {
    quoteNumber,
    inquiryId: inquiry.id,
    total: pricing.total,
  });
  await notifyCustomer(
    inquiry.customerId,
    "QUOTATION_SENT",
    `Your instant quotation ${quoteNumber} for ${service.name} is ready for review.`,
    `/quotations/${quotation.id}`
  );

  return { created: true, quotationId: quotation.id };
}
