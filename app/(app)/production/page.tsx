import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Alert } from "@/components/ui/alert";
import { KanbanBoard, type KanbanJobOrder } from "./kanban-board";

export default async function ProductionQueuePage({ searchParams }: PageProps<"/production">) {
  const user = await requireRole(["PRODUCTION", "ADMIN", "STAFF"]);
  if (user.role === "STAFF" && !(await can(user, "PRODUCTION_VIEW"))) redirect("/dashboard");
  const canUpdateStage = user.role !== "STAFF" || (await can(user, "PRODUCTION_UPDATE_STAGE"));
  const canMarkStageComplete = user.role !== "STAFF" || (await can(user, "PRODUCTION_MARK_STAGE_COMPLETE"));
  // Messenger dispatch is a customer-communication action, not a production-
  // floor one — PRODUCTION never sees it (mirrors canSeeAmount below), ADMIN
  // always does, STAFF needs the explicit grant.
  const canDispatchMessenger = user.role === "ADMIN" || (user.role === "STAFF" && (await can(user, "MESSENGER_DISPATCH")));
  // Production-floor staff don't need to see order values — amounts are a
  // Staff/Admin-facing detail (spec: "Amount, where appropriate for
  // Staff/Admin").
  const canSeeAmount = user.role !== "PRODUCTION";
  const sp = await searchParams;
  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;

  const [jobOrders, templates] = await Promise.all([
    prisma.jobOrder.findMany({
      where: { status: { in: ["IN_PROGRESS", "REWORK", "QC", "READY"] } },
      include: {
        order: { include: { customer: true, fulfillments: { orderBy: { createdAt: "desc" }, take: 1 } } },
        stageLogs: { orderBy: { createdAt: "desc" }, include: { assignedTo: true } },
      },
      orderBy: { deadline: "asc" },
    }),
    prisma.workflowTemplate.findMany({
      where: { active: true },
      include: { stages: { orderBy: { order: "asc" } } },
    }),
  ]);

  // Columns = the union of configured stage names across active workflow
  // templates, in first-seen order — reuses the existing WorkflowTemplate/
  // WorkflowStage architecture instead of inventing a separate stage list.
  // A given Job Order only ever lands in the column matching its own
  // Service's configured flow, so Tarpaulin and Uniforms job orders show up
  // under their own respective stages, never a one-size-fits-all sequence.
  const READY_COLUMN = "Ready for Fulfillment";
  const columnNames: string[] = [];
  for (const t of templates) {
    for (const s of t.stages) {
      if (!columnNames.includes(s.name)) columnNames.push(s.name);
    }
  }
  columnNames.push(READY_COLUMN);

  const now = Date.now();
  const items: KanbanJobOrder[] = jobOrders.map((jo) => {
    const currentLog = jo.stageLogs.find((l) => l.stageOrder === jo.currentStageOrder && l.status !== "COMPLETED");
    const column = jo.status === "READY" ? READY_COLUMN : currentLog?.stageName ?? READY_COLUMN;
    const specs = (jo.specs as Record<string, string> | null) ?? null;
    return {
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
  });

  const stageCounts = {
    active: items.length,
    inProduction: items.filter((i) => i.status === "IN_PROGRESS" || i.status === "REWORK").length,
    inQc: items.filter((i) => i.status === "QC").length,
    ready: items.filter((i) => i.status === "READY").length,
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
        columns={columnNames}
        jobOrders={items}
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
