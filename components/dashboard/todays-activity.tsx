import Link from "next/link";
import { Inbox, FileText, Package, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { EmptyState } from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";
import type { ActivityRow } from "@/lib/dashboard-data";

// Same tone family as kpi-card.tsx's ICON_TONE_CLASSES, one icon per
// transaction type so the feed reads at a glance (Aug 22 dashboard
// redesign) — mirrors the KPI row's own icon-tile treatment rather than
// introducing a separate visual language for this one card.
const TYPE_ICON: Record<ActivityRow["transaction"], { icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  Inquiry: { icon: Inbox, cls: "bg-accent-100 text-accent-600" },
  Quotation: { icon: FileText, cls: "bg-info-100 text-info-600" },
  "Job Order": { icon: Package, cls: "bg-warning-100 text-warning-600" },
  Payment: { icon: Wallet, cls: "bg-success-100 text-success-600" },
};

/**
 * Spec item 19 — every row is a real record; clicking it opens the actual
 * existing detail page, never a synthetic activity feed entity. A compact
 * icon feed (rather than a wide data table) so this reads well at the
 * narrower 1/3-column width it now shares a row with (Aug 22 dashboard
 * redesign) — same underlying rows/fields, just a denser presentation;
 * status is still one click away on the linked detail page.
 */
export function TodaysActivity({ rows, showAmounts }: { rows: ActivityRow[]; showAmounts: boolean }) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Today's Activity" actionLabel="View all" actionHref="/reports/summary" />
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="px-5 py-4">
            <EmptyState label="No transactions recorded today." />
          </div>
        ) : (
          <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
            {rows.map((r) => {
              const { icon: Icon, cls } = TYPE_ICON[r.transaction];
              return (
                <Link key={r.id} href={r.href} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", cls)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{r.customer}</span>
                    <span className="block text-xs text-slate-400">
                      {r.time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · {r.transaction}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-semibold text-slate-700">{r.reference}</span>
                    {showAmounts && r.amount !== null && <span className="block text-xs text-slate-400">{formatCurrency(r.amount)}</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
