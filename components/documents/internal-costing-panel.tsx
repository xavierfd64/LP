import type { AggregateCostEstimate } from "@/lib/service-cost";
import { EditorPanel } from "@/components/documents/editor-shell";
import { formatCurrency } from "@/lib/utils";

/**
 * Staff/Admin-only estimated cost/profit panel (Aug 20 1st update, spec
 * items 9/10/18) — every caller must gate this behind COST_VIEW (or Admin)
 * before rendering it; it is never shown to a CUSTOMER role. Labeled
 * "Estimated" throughout per spec item 10. As of the 4th update (Part D),
 * the underlying figure may come from either a live BOM-aware calculation
 * or a stored historical snapshot (see the Order page's own `title`,
 * which distinguishes the two) — this component itself just renders
 * whatever AggregateCostEstimate it's handed.
 */
export function InternalCostingPanel({ estimate, title = "Internal Costing" }: { estimate: AggregateCostEstimate; title?: string }) {
  if (estimate.totalCount === 0) return null;

  return (
    <EditorPanel title={`${title} (Staff Only)`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Estimated Production Cost</p>
          {estimate.fullyConfigured ? (
            <p className="text-lg font-semibold text-slate-900">{formatCurrency(estimate.totalCost)}</p>
          ) : (
            <>
              <p className="text-lg font-semibold text-slate-400">Not fully configured</p>
              <p className="text-xs text-amber-600">
                {estimate.configuredCount} of {estimate.totalCount} item{estimate.totalCount === 1 ? "" : "s"} has a configured cost
              </p>
            </>
          )}
        </div>
        <div>
          <p className="text-xs text-slate-500">Estimated Gross Profit</p>
          <p className="text-lg font-semibold text-slate-900">
            {estimate.grossProfit != null ? formatCurrency(estimate.grossProfit) : "—"}
          </p>
          {estimate.grossProfit == null && <p className="text-xs text-slate-400">Profit unavailable — production cost has not been configured.</p>}
        </div>
        <div>
          <p className="text-xs text-slate-500">Estimated Margin</p>
          <p className="text-lg font-semibold text-slate-900">{estimate.margin != null ? `${estimate.margin.toFixed(1)}%` : "—"}</p>
        </div>
      </div>
    </EditorPanel>
  );
}
