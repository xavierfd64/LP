import { redirect } from "next/navigation";
import Link from "next/link";
import { Boxes, Factory, Percent, PackageCheck, Settings, BarChart3 } from "lucide-react";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { KanbanBoard, type KanbanJobOrder, type ServiceBoard } from "./kanban-board";
import { CompletedTodayCard, type CompletedTodayItem } from "./completed-today-card";

const READY_COLUMN = "Ready for Fulfillment";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Production Kanban (Aug 19 1st update — service-aware rework; Aug 22 3rd
 * update — visual redesign only). Each active Service's own real
 * WorkflowTemplate (Services module, not the job order's free-text
 * productType) becomes its own board with its own column set — never one
 * merged "fake universal workflow" column list across every service (spec
 * items 8-16). Job Orders group by their real `serviceId` relation; the
 * rare Job Order predating the Service Master feature (serviceId null)
 * falls back to its own WorkflowTemplate's name as a labeled group, still
 * using that template's real stages — never inferred from productType
 * text. This grouping is deliberately UNCHANGED by the Aug 22 visual
 * redesign — only the header, summary cards, filters, column, and card
 * presentation changed; see kanban-board.tsx's own comment for why a
 * merged single-board view (closer to the reference illustration) was
 * intentionally not implemented.
 */
export default async function ProductionQueuePage({ searchParams }: PageProps<"/production">) {
  const user = await requireRole(["PRODUCTION", "ADMIN", "STAFF"]);
  if (user.role === "STAFF" && !(await can(user, "PRODUCTION_VIEW"))) redirect("/dashboard");
  const canUpdateStage = user.role !== "STAFF" || (await can(user, "PRODUCTION_UPDATE_STAGE"));
  const canMarkStageComplete = user.role !== "STAFF" || (await can(user, "PRODUCTION_MARK_STAGE_COMPLETE"));
  const canDispatchMessenger = user.role === "ADMIN" || (user.role === "STAFF" && (await can(user, "MESSENGER_DISPATCH")));
  const canSeeAmount = user.role !== "PRODUCTION";
  // "+ New Job Order" / per-column "Add Job" buttons and the header's
  // Reports/Settings shortcuts all point at existing pages this session's
  // scope didn't add — gated to the roles that can actually use them so a
  // Production-role account (which has no Customer record) never lands on
  // a page that assumes one.
  const canManageOrders = user.role === "STAFF" || user.role === "ADMIN";
  const canSeeReports = user.role === "ADMIN" || (user.role === "STAFF" && (await can(user, "REPORTS_VIEW")));
  const canSeeSettings = user.role === "ADMIN";
  const sp = await searchParams;
  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;

  const [services, jobOrders, completedToday] = await Promise.all([
    // Spec item 9: only active, saved services — nothing hard-coded, no
    // draft/deleted/demo entries. New services (and workflow reassignments)
    // appear automatically since this is the exact same query the Services
    // module itself is the source of truth for.
    prisma.service.findMany({
      where: { active: true },
      include: { workflowTemplate: { include: { stages: { orderBy: { order: "asc" } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.jobOrder.findMany({
      where: { status: { in: ["IN_PROGRESS", "REWORK", "QC", "READY"] } },
      include: {
        order: { include: { customer: true, fulfillments: { orderBy: { createdAt: "desc" }, take: 1 } } },
        service: { include: { workflowTemplate: { include: { stages: { orderBy: { order: "asc" } } } } } },
        workflowTemplate: { include: { stages: { orderBy: { order: "asc" } } } },
        stageLogs: { orderBy: { createdAt: "desc" }, include: { assignedTo: true } },
      },
      orderBy: { deadline: "asc" },
    }),
    prisma.jobOrder.findMany({
      where: { status: "COMPLETED", updatedAt: { gte: startOfToday() } },
      include: { order: { include: { customer: true } } },
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
  ]);

  const now = Date.now();
  const boardsByKey = new Map<string, ServiceBoard>();

  function boardFor(key: string, label: string, stages: { name: string; order: number }[]): ServiceBoard {
    let board = boardsByKey.get(key);
    if (!board) {
      const columns =
        stages.length > 0
          ? [...stages.map((s) => ({ name: s.name, order: s.order })), { name: READY_COLUMN, order: stages.length + 1 }]
          : [];
      board = { key, label, columns, jobOrders: [] };
      boardsByKey.set(key, board);
    }
    return board;
  }

  // Pre-create a board for every active service — even one with zero job
  // orders right now, or no production workflow assigned yet — so the
  // dropdown always reflects the full, real Services module (spec item 9:
  // "once a service is successfully saved, it should automatically become
  // available in the Kanban," not just once it happens to have work).
  for (const s of services) {
    boardFor(s.id, s.name, s.workflowTemplate?.stages ?? []);
  }

  for (const jo of jobOrders) {
    const key = jo.serviceId && jo.service ? jo.serviceId : `wf:${jo.workflowTemplateId}`;
    const label = jo.service?.name ?? `${jo.workflowTemplate.name} (unlinked service)`;
    // A job order's own workflowTemplate is always the real source for its
    // stage list, even when it's grouped under a Service board — the two
    // agree by construction for normal (service-linked) job orders, and
    // the fallback path uses the job order's own template directly.
    const stages = jo.serviceId && jo.service?.workflowTemplate ? jo.service.workflowTemplate.stages : jo.workflowTemplate.stages;
    const board = boardFor(key, label, stages);

    const currentLog = jo.stageLogs.find((l) => l.stageOrder === jo.currentStageOrder && l.status !== "COMPLETED");
    const column = jo.status === "READY" ? READY_COLUMN : currentLog?.stageName ?? READY_COLUMN;
    const specs = (jo.specs as Record<string, string> | null) ?? null;
    const columnIndex = board.columns.findIndex((c) => c.name === column);
    // Real, derived progress — how far through this job's own workflow it
    // has traveled (0% at the first stage, 100% once it reaches the
    // synthetic Ready column) — never a fabricated per-card estimate, since
    // nothing in the schema tracks in-stage completion percentage.
    const progressPct = board.columns.length > 1 && columnIndex >= 0 ? Math.round((columnIndex / (board.columns.length - 1)) * 100) : 0;
    // The date this job actually reached the Ready column — the most
    // recently completed stage log, not a fabricated "completed today"
    // guess. Null only for legacy data with no recorded stage-log history.
    const readyAt =
      column === READY_COLUMN
        ? jo.stageLogs
            .filter((l) => l.status === "COMPLETED" && l.completedAt)
            .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0]?.completedAt ?? null
        : null;

    const item: KanbanJobOrder = {
      id: jo.id,
      joNumber: jo.joNumber,
      productType: jo.productType,
      quantity: jo.quantity,
      specs: specs ? Object.entries(specs).filter(([, v]) => v).slice(0, 2) : [],
      deadline: jo.deadline ? jo.deadline.toISOString() : null,
      readyAt: readyAt ? readyAt.toISOString() : null,
      overdue: !!jo.deadline && jo.deadline.getTime() < now && jo.status !== "READY",
      status: jo.status,
      orderNumber: jo.order.orderNumber,
      customerName: jo.order.customer.name,
      amount: canSeeAmount ? Number(jo.order.totalAmount) : null,
      courier: jo.order.fulfillments[0]?.courier ?? null,
      column,
      progressPct,
      currentLogId: currentLog?.id ?? null,
      currentLogStatus: currentLog?.status ?? null,
      assignedStaffName: currentLog?.assignedTo?.name ?? null,
    };
    board.jobOrders.push(item);
  }

  const boards = Array.from(boardsByKey.values());
  const allItems = boards.flatMap((b) => b.jobOrders);
  const stageCounts = {
    active: allItems.length,
    inProduction: allItems.filter((i) => i.status === "IN_PROGRESS" || i.status === "REWORK").length,
    inQc: allItems.filter((i) => i.status === "QC").length,
    ready: allItems.filter((i) => i.status === "READY").length,
  };
  const pct = (n: number) => (stageCounts.active > 0 ? Math.round((n / stageCounts.active) * 100) : 0);

  const completedTodayItems: CompletedTodayItem[] = completedToday.map((jo) => ({
    id: jo.id,
    joNumber: jo.joNumber,
    productType: jo.productType,
    customerName: jo.order.customer.name,
    completedAt: jo.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Operations &amp; Workflow</p>
          <h1 className="text-2xl font-bold text-slate-900">Printing Production Kanban</h1>
          <p className="mt-1 text-sm text-slate-500">Manage and track job orders from design to delivery.</p>
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
          {canManageOrders && (
            <Link href="/orders">
              <Button type="button" size="sm">
                + New Job Order
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="relative">
          <KpiCard label="Active Jobs" value={stageCounts.active} icon={Boxes} iconTone="purple" />
          <a href="#kanban-board" className="absolute bottom-4 left-4 text-xs font-medium text-brand-600 hover:underline">
            View all jobs →
          </a>
        </div>
        <KpiCard label="In Production" value={stageCounts.inProduction} sub={`${pct(stageCounts.inProduction)}% of active jobs`} icon={Factory} iconTone="blue" />
        <KpiCard label="In QC" value={stageCounts.inQc} sub={`${pct(stageCounts.inQc)}% of active jobs`} icon={Percent} iconTone="orange" />
        <KpiCard label="Ready" value={stageCounts.ready} sub={`${pct(stageCounts.ready)}% of active jobs`} icon={PackageCheck} iconTone="purple" />
        <CompletedTodayCard count={completedTodayItems.length} items={completedTodayItems} />
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <div id="kanban-board">
        <KanbanBoard
          boards={boards}
          canUpdateStage={canUpdateStage}
          canMarkStageComplete={canMarkStageComplete}
          canDispatchMessenger={canDispatchMessenger}
          canManageOrders={canManageOrders}
        />
      </div>
    </div>
  );
}
