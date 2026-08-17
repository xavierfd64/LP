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
  const sp = await searchParams;
  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;

  const [jobOrders, templates] = await Promise.all([
    prisma.jobOrder.findMany({
      where: { status: { in: ["IN_PROGRESS", "REWORK", "QC", "READY"] } },
      include: {
        order: { include: { customer: true } },
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
  const READY_COLUMN = "Ready for Fulfillment";
  const columnNames: string[] = [];
  for (const t of templates) {
    for (const s of t.stages) {
      if (!columnNames.includes(s.name)) columnNames.push(s.name);
    }
  }
  columnNames.push(READY_COLUMN);

  const items: KanbanJobOrder[] = jobOrders.map((jo) => {
    const currentLog = jo.stageLogs.find((l) => l.stageOrder === jo.currentStageOrder && l.status !== "COMPLETED");
    const column = jo.status === "READY" ? READY_COLUMN : currentLog?.stageName ?? READY_COLUMN;
    return {
      id: jo.id,
      joNumber: jo.joNumber,
      productType: jo.productType,
      quantity: jo.quantity,
      deadline: jo.deadline ? jo.deadline.toISOString() : null,
      status: jo.status,
      orderNumber: jo.order.orderNumber,
      customerName: jo.order.customer.name,
      column,
      currentLogId: currentLog?.id ?? null,
      currentLogStatus: currentLog?.status ?? null,
      assignedStaffName: currentLog?.assignedTo?.name ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Production Board</h1>
      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <KanbanBoard
        columns={columnNames}
        jobOrders={items}
        canUpdateStage={canUpdateStage}
        canMarkStageComplete={canMarkStageComplete}
      />
    </div>
  );
}
