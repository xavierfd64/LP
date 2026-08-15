import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { QuotationForm } from "./quotation-form";

export default async function NewQuotationPage({ searchParams }: PageProps<"/quotations/new">) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "QUOTATION_CREATE"))) redirect("/quotations");
  const sp = await searchParams;
  const inquiryId = typeof sp.inquiryId === "string" ? sp.inquiryId : undefined;

  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, companyName: true },
    orderBy: { name: "asc" },
  });

  const inquiry = inquiryId
    ? await prisma.inquiry.findUnique({ where: { id: inquiryId } })
    : null;

  // If this inquiry was reopened by a customer's revision request, prefill
  // the new quotation with the previous one's line items for convenience.
  const priorQuotation = inquiryId
    ? await prisma.quotation.findFirst({
        where: { inquiryId, status: { in: ["REVISION_REQUESTED", "CANCELLED"] } },
        include: { lineItems: true, revisionRequests: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { createdAt: "desc" },
      })
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">New Quotation</h1>

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
            customers={customers}
            inquiryId={inquiry?.id}
            defaultCustomerId={inquiry?.customerId}
            defaultProductType={inquiry?.desiredProduct}
            defaultLineItems={priorQuotation?.lineItems.map((li) => ({
              productType: li.productType,
              description: li.description,
              qty: li.qty,
              unitPrice: Number(li.unitPrice),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
