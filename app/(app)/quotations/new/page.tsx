import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuotationForm } from "./quotation-form";

export default async function NewQuotationPage({ searchParams }: PageProps<"/quotations/new">) {
  await requireRole(["STAFF", "ADMIN"]);
  const sp = await searchParams;
  const inquiryId = typeof sp.inquiryId === "string" ? sp.inquiryId : undefined;

  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, companyName: true },
    orderBy: { name: "asc" },
  });

  const inquiry = inquiryId
    ? await prisma.inquiry.findUnique({ where: { id: inquiryId } })
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">New Quotation</h1>
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
          />
        </CardContent>
      </Card>
    </div>
  );
}
