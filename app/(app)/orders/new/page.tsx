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

  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, companyName: true, isQualifiedForTerms: true },
    orderBy: { name: "asc" },
  });

  const quotation = quotationId
    ? await prisma.quotation.findUnique({ where: { id: quotationId } })
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
            customers={customers}
            quotationId={quotation?.id}
            defaultCustomerId={quotation?.customerId}
            defaultTotal={quotation ? Number(quotation.total) : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
