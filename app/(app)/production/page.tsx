import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Alert } from "@/components/ui/alert";
import { KanbanBoard, type KanbanJobOrder, type ServiceBoard } from "./kanban-board";

const READY_COLUMN = "Ready for Fulfillment";

/**
 * Production Kanban (Aug 19 1st update — service-aware rework). Each
 * active Service's own real WorkflowTemplate (Services module, not the
 * job order's free-text productType) becomes its own board with its own
 * column set — never one merged "fake universal workflow" column list
 * across every service (spec items 8-16). Job Orders group by their real
 * `serviceId` relation; the rare Job Order predating the Service Master
 * feature (serviceId null) falls back to its own WorkflowTemplate's name
 * as a labeled group, still using that template's real stages — never
 * inferred from productType text.
 */
export default async function ProductionQueuePage({ searchParams }: PageProps<"/production">) {
  const user = await requireRole(["PRODUCTION", "ADMIN", "STAFF"]);
  if (user.role === "STAFF" && !(await can(user, "PRODUCTION_VIEW"))) redirect("/dashboard");
  const canUpdateStage = user.role !== "STAFF" || (await can(user, "PRODUCTION_UPDATE_STAGE"));
  const canMarkStageComplete = user.role !== "STAFF" || (await can(user, "PRODUCTION_MARK_STAGE_COMPLETE"));
  const canDispatchMessenger = user.role === "ADMIN" || (user.role === "STAFF" && (await can(user, "MESSENGER_DISPATCH")));
  const canSeeAmount = user.role !== "PRODUCTION";
  const sp = await searchParams;
  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;

  const [services, jobOrders] = await Promise.all([
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

    const item: KanbanJobOrder = {
      id: jo.id,
      joNumber: jo.joNumber,
      productType: jo.productType,
      quantity: jo.quantity,
      specs: specs ? Object.entries(specs).filter(([, v]) => v).slice(0, 2) : [],
      deadline: jo.deadline ? jo.deadline.toISOString() : null,
      overdue: !!jo.deadline && jo.deadline.getTime() < now && jo.status !== "READY",
      status: jo.status,
      orderNumber: jo.order.orderNumber,
      customerName: jo.order.customer.name,
      amount: canSeeAmount ? Number(jo.order.totalAmount) : null,
      courier: jo.order.fulfillments[0]?.courier ?? null,
      column,
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Operations &amp; Workflow</p>
        <h1 className="text-2xl font-bold text-slate-900">Printing Production Kanban</h1>
        <p className="mt-1 text-sm text-slate-500">Manage active Job Orders and production progress.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPill label="Active Jobs" value={stageCounts.active} />
        <StatPill label="In Production" value={stageCounts.inProduction} />
        <StatPill label="In QC" value={stageCounts.inQc} />
        <StatPill label="Ready" value={stageCounts.ready} />
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <KanbanBoard
        boards={boards}
        canUpdateStage={canUpdateStage}
        canMarkStageComplete={canMarkStageComplete}
        canDispatchMessenger={canDispatchMessenger}
      />
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
