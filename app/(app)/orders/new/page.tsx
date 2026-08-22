import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { BusinessInfoBanner } from "@/components/documents/business-info-banner";
import { EditorShell, EditorHeader } from "@/components/documents/editor-shell";
import { OrderForm } from "./order-form";

export default async function NewOrderPage({ searchParams }: PageProps<"/orders/new">) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "ORDER_CREATE"))) redirect("/orders");
  const sp = await searchParams;
  const quotationId = typeof sp.quotationId === "string" ? sp.quotationId : undefined;

  const quotation = quotationId
    ? await prisma.quotation.findUnique({ where: { id: quotationId }, include: { customer: true, lineItems: true } })
    : null;

  return (
    <EditorShell className="max-w-4xl">
      <EditorHeader
        eyebrow="Order"
        title={
          <span className="flex items-center gap-2">
            <Package className="h-6 w-6 text-brand-600" />
            New Order
          </span>
        }
        subtitle="Create a new order. You can create an order from an approved quotation."
      />
      <BusinessInfoBanner />
      <OrderForm
        initialQuotation={
          quotation
            ? {
                id: quotation.id,
                quoteNumber: quotation.quoteNumber,
                customerId: quotation.customerId,
                customerName: quotation.customer.name,
                total: quotation.total.toString(),
              }
            : null
        }
        defaultCustomer={
          quotation
            ? {
                id: quotation.customer.id,
                displayId: quotation.customer.displayId,
                name: quotation.customer.name,
                companyName: quotation.customer.companyName,
                email: quotation.customer.email,
                contactNumber: quotation.customer.contactNumber,
                hasLogin: !!quotation.customer.userId,
                isQualifiedForTerms: quotation.customer.isQualifiedForTerms,
              }
            : null
        }
        initialQuotationLineItems={
          quotation
            ? quotation.lineItems.map((li) => ({ id: li.id, productType: li.productType, description: li.description, qty: li.qty, unit: li.unit, unitPrice: li.unitPrice.toString() }))
            : undefined
        }
        initialQuotationTotals={
          quotation
            ? {
                subtotal: quotation.subtotal != null ? quotation.subtotal.toString() : null,
                discountAmount: quotation.discountAmount.toString(),
                discountLabel: quotation.discountLabel,
                taxAmount: quotation.taxAmount.toString(),
              }
            : undefined
        }
        defaultTotal={quotation ? Number(quotation.total) : undefined}
      />
    </EditorShell>
  );
}
