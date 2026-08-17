import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderForm } from "./order-form";

export default async function NewOrderPage({ searchParams }: PageProps<"/orders/new">) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "ORDER_CREATE"))) redirect("/orders");
  const sp = await searchParams;
  const quotationId = typeof sp.quotationId === "string" ? sp.quotationId : undefined;

  const quotation = quotationId
    ? await prisma.quotation.findUnique({ where: { id: quotationId }, include: { customer: true } })
    : null;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">New Order</h1>
      <Card>
        <CardHeader>
          <CardTitle>{quotation ? `From quotation ${quotation.quoteNumber}` : "Create order"}</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderForm
            quotationId={quotation?.id}
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
            defaultTotal={quotation ? Number(quotation.total) : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
