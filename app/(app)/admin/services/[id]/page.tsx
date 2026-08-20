import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ServiceForm } from "../service-form";
import { PricingForm } from "./pricing-form";
import { computeServiceCostBreakdown } from "@/lib/service-costing";

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

  const costingStatus = (await computeServiceCostBreakdown(service.id, 1)).status;
  const statusBadge =
    costingStatus === "CONFIGURED" ? (
      <Badge tone="green">Configured</Badge>
    ) : costingStatus === "PARTIAL" ? (
      <Badge tone="yellow">Partially Configured</Badge>
    ) : (
      <Badge tone="slate">Not Configured</Badge>
    );

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
            productionCost={service.productionCost != null ? Number(service.productionCost) : null}
            tiers={service.pricingTiers.map((t) => ({
              minQty: t.minQty,
              maxQty: t.maxQty,
              pricePerUnit: t.pricePerUnit != null ? Number(t.pricePerUnit) : null,
              discountPercent: t.discountPercent != null ? Number(t.discountPercent) : null,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Production Costing</CardTitle>
          {statusBadge}
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Configure the materials, labor, machine, finishing, and other direct costs that make up this service&apos;s
            estimated production cost.
          </p>
          <Link href={`/admin/services/${service.id}/costing`}>
            <Button variant="outline">Manage Costing →</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
