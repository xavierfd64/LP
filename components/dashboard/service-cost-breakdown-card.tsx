import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { ServiceCostBreakdownChart } from "./admin-charts";
import { formatCurrency } from "@/lib/utils";
import type { ServiceCostBreakdownDashboard } from "@/lib/dashboard-data";

/**
 * "Service Cost Breakdown" card (Whiskey dashboard reference) — reuses
 * computeServiceCostBreakdown via getServiceCostBreakdownForDashboard,
 * the same authoritative costing function the Service Costing admin page
 * reads. Renders nothing fabricated when no service is fully costed yet.
 */
export function ServiceCostBreakdownCard({ breakdown, configureHref }: { breakdown: ServiceCostBreakdownDashboard; configureHref: string }) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Service Cost Breakdown" subtitle={breakdown ? `Example: ${breakdown.serviceName}` : "No fully-costed service yet"} />
      </CardHeader>
      <CardContent>
        {breakdown ? (
          <>
            <ServiceCostBreakdownChart
              materialCost={breakdown.materialCost}
              laborCost={breakdown.laborCost}
              overheadCost={breakdown.overheadCost}
              profitMargin={breakdown.profitMargin}
            />
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-500">Total Estimated Cost</span>
              <span className="font-semibold text-slate-900">{formatCurrency(breakdown.totalEstimatedCost)}</span>
            </div>
            {breakdown.suggestedPrice != null && (
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-slate-500">Suggested Price</span>
                <span className="font-bold text-brand-600">{formatCurrency(breakdown.suggestedPrice)}</span>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-400">
            No service has a fully configured cost breakdown yet.{" "}
            <a href={configureHref} className="font-medium text-brand-600 hover:text-brand-700">
              Configure service costs
            </a>
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}
