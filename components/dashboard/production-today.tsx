import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { EmptyState } from "@/components/ui/table";
import type { ProductionStageCount } from "@/lib/dashboard-data";

/** Spec items 17/18 — summarizes the Kanban rather than duplicating it; stages come from the same real WorkflowTemplate data the Kanban itself renders. */
export function ProductionToday({ stages }: { stages: ProductionStageCount[] }) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Production Today" actionLabel="Open Production Board" actionHref="/production" />
      </CardHeader>
      <CardContent>
        {stages.length === 0 ? (
          <EmptyState label="No active job orders in production." />
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {stages.map((s) => (
              <Link
                key={s.stage}
                href="/production"
                className="rounded-md border border-slate-100 px-2 py-2.5 text-center transition-colors hover:border-brand-200 hover:bg-brand-50"
              >
                <p className="text-lg font-bold text-slate-900">{s.count}</p>
                <p className="truncate text-[11px] uppercase tracking-wide text-slate-500">{s.stage}</p>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
