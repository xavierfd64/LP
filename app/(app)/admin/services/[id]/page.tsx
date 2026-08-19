import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServiceForm } from "../service-form";
import { PricingForm } from "./pricing-form";

export default async function EditServicePage({ params }: PageProps<"/admin/services/[id]">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "SERVICE_MANAGE"))) redirect("/admin/services");

  const { id } = await params;
  const [service, templates] = await Promise.all([
    prisma.service.findUnique({ where: { id }, include: { pricingTiers: { orderBy: { minQty: "asc" } } } }),
    prisma.workflowTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!service) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Edit Service</h1>
      <Card>
        <CardHeader>
          <CardTitle>Service details</CardTitle>
        </CardHeader>
        <CardContent>
          <ServiceForm
            templates={templates}
            service={{
              id: service.id,
              name: service.name,
              description: service.description,
              category: service.category,
              workflowTemplateId: service.workflowTemplateId,
              specFields: (service.specFields as string[]) ?? [],
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing &amp; Discounts</CardTitle>
        </CardHeader>
        <CardContent>
          <PricingForm
            serviceId={service.id}
            pricingMethod={service.pricingMethod}
            basePrice={service.basePrice != null ? Number(service.basePrice) : null}
            minQuantity={service.minQuantity}
            instantQuoteEnabled={service.instantQuoteEnabled}
            tiers={service.pricingTiers.map((t) => ({
              minQty: t.minQty,
              maxQty: t.maxQty,
              pricePerUnit: t.pricePerUnit != null ? Number(t.pricePerUnit) : null,
              discountPercent: t.discountPercent != null ? Number(t.discountPercent) : null,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
