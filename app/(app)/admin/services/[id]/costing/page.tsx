import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";
import { computeServiceCostBreakdown, computeMargin, computeRecommendedSellingPrice } from "@/lib/service-costing";
import { computeItemCostBasis } from "@/lib/inventory-cost";
import { MaterialFormModal } from "./material-form-modal";
import { CostComponentFormModal } from "./cost-component-form-modal";
import { DeleteBomLineButton } from "./delete-bom-line-button";
import { TargetMarginForm } from "./target-margin-form";

const CATEGORY_LABELS: Record<string, string> = { LABOR: "Labor", MACHINE: "Machine/Electricity", FINISHING: "Finishing", OTHER: "Other Direct Cost" };
const BASIS_LABELS: Record<string, string> = { PER_UNIT: "Per unit", PER_HOUR: "Per hour", FLAT: "Flat" };

/**
 * The Service's BOM / production-costing configuration (Aug 20 4th update,
 * Part D). Every figure here is computed by the one shared engine
 * (lib/service-costing.ts) at an explicit preview quantity/price — the
 * same function Quotations/Orders use, just driven by ?qty=/&price=
 * instead of a real line item. Nothing here is ever auto-saved from
 * adjusting the preview; only the "Add/Edit Material", "Add/Edit Cost
 * Component", and "Save Target Margin" forms actually persist anything.
 */
export default async function ServiceCostingPage({ params, searchParams }: PageProps<"/admin/services/[id]/costing">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "SERVICE_MANAGE"))) redirect("/admin/services");

  const { id } = await params;
  const sp = await searchParams;

  const service = await prisma.service.findUnique({
    where: { id },
    include: {
      bomMaterials: { include: { inventoryItem: true }, orderBy: { sortOrder: "asc" } },
      costComponents: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!service) notFound();

  const previewQty = Math.max(1, Number(sp.qty) || service.minQuantity || 1);
  const sellingPriceInput = sp.price != null && sp.price !== "" ? Number(sp.price) : service.basePrice != null ? Number(service.basePrice) : null;

  const [breakdown, inventoryItems] = await Promise.all([
    computeServiceCostBreakdown(service.id, previewQty),
    prisma.inventoryItem.findMany({ orderBy: { name: "asc" } }),
  ]);
  const materialOptions = await Promise.all(
    inventoryItems.map(async (i) => {
      const basis = await computeItemCostBasis(i.id);
      return { id: i.id, name: i.name, unit: i.unit, averageUnitCost: basis.averageUnitCost };
    })
  );

  const { grossProfit, marginPct } = computeMargin(sellingPriceInput, breakdown.totalCost);
  const recommendedPrice = computeRecommendedSellingPrice(
    breakdown.totalCost,
    service.targetMarginPct != null ? Number(service.targetMarginPct) : null
  );

  const statusBadge =
    breakdown.status === "CONFIGURED" ? (
      <Badge tone="green">Configured</Badge>
    ) : breakdown.status === "PARTIAL" ? (
      <Badge tone="yellow">Partially Configured</Badge>
    ) : (
      <Badge tone="slate">Not Configured</Badge>
    );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{service.name}</h1>
          <p className="text-sm text-slate-500">Production Costing</p>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge}
          <Link href={`/admin/services/${service.id}`}>
            <Button variant="outline">Back to Service</Button>
          </Link>
        </div>
      </div>

      {breakdown.mode === "FLAT" && (
        <Alert tone="info">
          This service has no BOM yet — it&apos;s still using the simple flat production cost from the Pricing tab
          ({service.productionCost != null ? formatCurrency(service.productionCost.toString()) : "not configured"}
          {" "}per unit). Adding a material or cost component below will switch it to full BOM-based costing.
        </Alert>
      )}
      {breakdown.status === "PARTIAL" && (
        <Alert tone="warning">
          Costing incomplete — {breakdown.totalLineCount - breakdown.configuredCount} of {breakdown.totalLineCount} cost
          component{breakdown.totalLineCount === 1 ? "" : "s"} {breakdown.totalLineCount - breakdown.configuredCount === 1 ? "is" : "are"} missing cost
          data. No production cost or profit is shown below to avoid understating it.
        </Alert>
      )}
      {breakdown.status === "NOT_CONFIGURED" && (
        <Alert tone="warning">Production cost has not been configured for this service.</Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Material Components</CardTitle>
          <MaterialFormModal serviceId={service.id} materials={materialOptions} />
        </CardHeader>
            <Table>
              <THead>
                <TR>
                  <TH>Material</TH>
                  <TH>Consumption / unit</TH>
                  <TH>Waste</TH>
                  <TH>Estimated Cost (× {previewQty})</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {service.bomMaterials.map((m) => {
                  const line = breakdown.materialLines.find((l) => l.id === m.id);
                  return (
                    <TR key={m.id}>
                      <TD className="font-medium text-slate-900">{m.inventoryItem.name}</TD>
                      <TD className="text-sm text-slate-600">
                        {Number(m.consumptionPerUnit)} {m.inventoryItem.unit}
                      </TD>
                      <TD className="text-sm text-slate-600">{m.wastePercent != null ? `${m.wastePercent}%` : "—"}</TD>
                      <TD className={line?.amount == null ? "text-sm text-amber-600" : "font-medium text-slate-900"}>
                        {line?.amount != null ? formatCurrency(line.amount) : "Material cost unavailable"}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-3">
                          <MaterialFormModal
                            serviceId={service.id}
                            materials={materialOptions}
                            material={{ id: m.id, inventoryItemId: m.inventoryItemId, consumptionPerUnit: Number(m.consumptionPerUnit), wastePercent: m.wastePercent != null ? Number(m.wastePercent) : null }}
                          />
                          <DeleteBomLineButton kind="material" id={m.id} label={m.inventoryItem.name} />
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {service.bomMaterials.length === 0 && <EmptyState label="No material components yet." />}
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>Direct Production Costs</CardTitle>
              <CostComponentFormModal serviceId={service.id} />
            </CardHeader>
            <Table>
              <THead>
                <TR>
                  <TH>Category</TH>
                  <TH>Label</TH>
                  <TH>Basis</TH>
                  <TH>Rate</TH>
                  <TH>Estimated Cost (× {previewQty})</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {service.costComponents.map((c) => {
                  const line = breakdown.componentLines.find((l) => l.id === c.id);
                  return (
                    <TR key={c.id}>
                      <TD className="text-sm text-slate-600">{CATEGORY_LABELS[c.category]}</TD>
                      <TD className="font-medium text-slate-900">{c.label}</TD>
                      <TD className="text-sm text-slate-600">
                        {BASIS_LABELS[c.basis]}
                        {c.basis === "PER_HOUR" && c.estimatedHours != null && ` (${c.estimatedHours}h)`}
                      </TD>
                      <TD className="text-sm text-slate-600">
                        {formatCurrency(c.rate.toString())}
                        {c.basis === "PER_HOUR" ? "/hr" : c.basis === "PER_UNIT" ? "/unit" : ""}
                      </TD>
                      <TD className={line?.amount == null ? "text-sm text-amber-600" : "font-medium text-slate-900"}>
                        {line?.amount != null ? formatCurrency(line.amount) : "Cost calculation incomplete"}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-3">
                          <CostComponentFormModal
                            serviceId={service.id}
                            component={{
                              id: c.id,
                              category: c.category,
                              label: c.label,
                              basis: c.basis,
                              rate: Number(c.rate),
                              estimatedHours: c.estimatedHours != null ? Number(c.estimatedHours) : null,
                            }}
                          />
                          <DeleteBomLineButton kind="component" id={c.id} label={c.label} />
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {service.costComponents.length === 0 && <EmptyState label="No direct production costs yet." />}
            {breakdown.wasteAmount != null && breakdown.wasteAmount > 0 && (
              <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
                Of which waste allowance: <span className="font-medium text-slate-900">{formatCurrency(breakdown.wasteAmount)}</span>
              </p>
            )}
          </Card>

      <Card>
        <CardHeader>
          <CardTitle>Margin Simulator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
            <div>
              <Label htmlFor="qty">Quantity</Label>
              <Input id="qty" name="qty" type="number" min={1} step={1} defaultValue={previewQty} />
            </div>
            <div>
              <Label htmlFor="price">Proposed Selling Price (total)</Label>
              <Input id="price" name="price" type="number" min={0} step="0.01" defaultValue={sellingPriceInput ?? ""} placeholder="e.g. 7000" />
            </div>
            <Button type="submit" variant="outline">
              Recalculate
            </Button>
          </form>

          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-slate-500">Est. Production Cost</p>
              <p className="text-lg font-semibold text-slate-900">{breakdown.totalCost != null ? formatCurrency(breakdown.totalCost) : "Not available"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Selling Price</p>
              <p className="text-lg font-semibold text-slate-900">{sellingPriceInput != null ? formatCurrency(sellingPriceInput) : "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Est. Gross Profit</p>
              <p className={`text-lg font-semibold ${grossProfit != null && grossProfit < 0 ? "text-error-600" : "text-slate-900"}`}>
                {grossProfit != null ? formatCurrency(grossProfit) : "Not available"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Est. Margin</p>
              <p className="text-lg font-semibold text-slate-900">{marginPct != null ? `${marginPct.toFixed(2)}%` : "—"}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            This simulator never changes the service&apos;s real selling price or any quotation — it&apos;s for internal
            what-if planning only.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target Margin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <TargetMarginForm serviceId={service.id} targetMarginPct={service.targetMarginPct != null ? Number(service.targetMarginPct) : null} />
          <div>
            <p className="text-xs uppercase text-slate-500">Recommended Selling Price</p>
            <p className="text-lg font-semibold text-slate-900">
              {recommendedPrice != null ? formatCurrency(recommendedPrice) : "Set a target margin and production cost to calculate"}
            </p>
            <p className="text-xs text-slate-400">
              At {previewQty} unit{previewQty === 1 ? "" : "s"} — never applied automatically to the actual selling price.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
