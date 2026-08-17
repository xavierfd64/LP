import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { BusinessInfoBanner } from "@/components/documents/business-info-banner";
import { QuotationForm } from "./quotation-form";
import type { LineItem } from "../line-items-editor";

export default async function NewQuotationPage({ searchParams }: PageProps<"/quotations/new">) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "QUOTATION_CREATE"))) redirect("/quotations");
  const sp = await searchParams;
  const inquiryId = typeof sp.inquiryId === "string" ? sp.inquiryId : undefined;

  const inquiry = inquiryId
    ? await prisma.inquiry.findUnique({ where: { id: inquiryId }, include: { customer: true, service: true } })
    : null;

  // If this inquiry was reopened by a customer's revision request, prefill
  // the new quotation with the previous one's line items for convenience.
  const priorQuotation = inquiryId
    ? await prisma.quotation.findFirst({
        where: { inquiryId, status: { in: ["REVISION_REQUESTED", "CANCELLED"] } },
        include: { lineItems: { include: { service: true } }, revisionRequests: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { createdAt: "desc" },
      })
    : null;

  // "Encode once, carry forward": a fresh quotation from an Inquiry starts
  // with one line item pre-filled from the Inquiry's selected Service and
  // specs, so staff never re-type what the customer already provided.
  const defaultLineItems: LineItem[] | undefined = priorQuotation
    ? priorQuotation.lineItems.map((li) => ({
        serviceId: li.serviceId ?? "",
        productType: li.productType,
        category: li.service?.category ?? null,
        specFields: (li.service?.specFields as string[]) ?? [],
        description: li.description,
        qty: li.qty,
        unitPrice: Number(li.unitPrice),
        specs: (li.specs as Record<string, string> | null) ?? null,
      }))
    : inquiry
      ? [
          {
            serviceId: inquiry.serviceId ?? "",
            productType: inquiry.desiredProduct,
            category: inquiry.service?.category ?? null,
            specFields: (inquiry.service?.specFields as string[]) ?? [],
            description: inquiry.description,
            qty: inquiry.roughQty ?? 1,
            unitPrice: 0,
            specs: (inquiry.specs as Record<string, string> | null) ?? null,
          },
        ]
      : undefined;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">New Quotation</h1>
      <BusinessInfoBanner />

      {priorQuotation?.revisionRequests[0] && (
        <Alert tone="warning">
          Customer requested changes to {priorQuotation.quoteNumber}: &ldquo;{priorQuotation.revisionRequests[0].message}&rdquo;
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{inquiry ? `From inquiry: ${inquiry.desiredProduct}` : "Create quotation"}</CardTitle>
        </CardHeader>
        <CardContent>
          <QuotationForm
            inquiryId={inquiry?.id}
            defaultCustomer={
              inquiry
                ? {
                    id: inquiry.customer.id,
                    displayId: inquiry.customer.displayId,
                    name: inquiry.customer.name,
                    companyName: inquiry.customer.companyName,
                    email: inquiry.customer.email,
                    contactNumber: inquiry.customer.contactNumber,
                    hasLogin: !!inquiry.customer.userId,
                    isQualifiedForTerms: inquiry.customer.isQualifiedForTerms,
                  }
                : null
            }
            defaultLineItems={defaultLineItems}
          />
        </CardContent>
      </Card>
    </div>
  );
}
