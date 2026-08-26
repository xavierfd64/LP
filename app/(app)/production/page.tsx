import { redirect } from "next/navigation";
import Link from "next/link";
import { Boxes, Factory, Percent, PackageCheck, Settings, BarChart3, ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { getProductionData, READY_COLUMN } from "@/lib/production-board";
import { CompletedTodayCard } from "./completed-today-card";
import { ServiceOverviewList } from "./service-overview-list";
import { AddJobDialog, type AddJobServiceOption } from "@/components/production/add-job-dialog";
import { ProductionMobileNav } from "@/components/production/production-mobile-nav";

/**
 * Production Overview (Production UI implementation, illustration 1) — the
 * module's landing page: real-data KPI summary + a per-service summary
 * list, each row opening into its own focused Kanban board at
 * /production/board/[key] (illustration 2). Previously this route rendered
 * every service's board stacked on one page (see kanban-board.tsx's own
 * doc comment for that history); this split is what actually implements
 * the illustration's two distinct views instead of conflating them.
 */
export default async function ProductionOverviewPage({ searchParams }: PageProps<"/production">) {
  const user = await requireRole(["PRODUCTION", "ADMIN", "STAFF"]);
  if (user.role === "STAFF" && !(await can(user, "PRODUCTION_VIEW"))) redirect("/dashboard");
  const canSeeAmount = user.role !== "PRODUCTION";
  const canSeeReports = user.role === "ADMIN" || (user.role === "STAFF" && (await can(user, "REPORTS_VIEW")));
  const canSeeSettings = user.role === "ADMIN";
  const canAddJob = user.role === "PRODUCTION" || user.role === "ADMIN" || (user.role === "STAFF" && (await can(user, "PRODUCTION_UPDATE_STAGE")));
  const sp = await searchParams;
  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;

  const { boards, stageCounts, completedTodayItems } = await getProductionData(canSeeAmount);
  const pct = (n: number) => (stageCounts.active > 0 ? Math.round((n / stageCounts.active) * 100) : 0);

  const addJobServices: AddJobServiceOption[] = boards
    .filter((b) => b.serviceId)
    .map((b) => ({ id: b.serviceId!, name: b.label, stages: b.columns.filter((c) => c.name !== READY_COLUMN) }));

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Production Overview</h1>
            <p className="mt-1 text-sm text-slate-500">Manage and track all production jobs across services.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSeeSettings && (
            <Link href="/admin/workflow-templates">
              <Button type="button" variant="outline" size="sm">
                <Settings className="h-4 w-4" /> Settings
              </Button>
            </Link>
          )}
          {canSeeReports && (
            <Link href="/reports/summary">
              <Button type="button" variant="outline" size="sm">
                <BarChart3 className="h-4 w-4" /> Reports
              </Button>
            </Link>
          )}
          {canAddJob && addJobServices.length > 0 && <AddJobDialog services={addJobServices} triggerLabel="+ New Job Order" />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="relative">
          <KpiCard label="Active Jobs" value={stageCounts.active} icon={Boxes} iconTone="purple" />
          <a href="#production-services" className="absolute bottom-4 left-4 text-xs font-medium text-brand-600 hover:underline">
            View all jobs →
          </a>
        </div>
        <KpiCard label="In Production" value={stageCounts.inProduction} sub={`${pct(stageCounts.inProduction)}% of active jobs`} icon={Factory} iconTone="blue" />
        <KpiCard label="In QC" value={stageCounts.inQc} sub={`${pct(stageCounts.inQc)}% of active jobs`} icon={Percent} iconTone="orange" />
        <KpiCard label="Ready for Delivery" value={stageCounts.ready} sub={`${pct(stageCounts.ready)}% of active jobs`} icon={PackageCheck} iconTone="purple" />
        <CompletedTodayCard count={completedTodayItems.length} items={completedTodayItems} />
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <div id="production-services" className="scroll-mt-4">
        <ServiceOverviewList boards={boards} />
      </div>

      <ProductionMobileNav canSeeSettings={canSeeSettings} canSeeReports={canSeeReports} />
    </div>
  );
}
