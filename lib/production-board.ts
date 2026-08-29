import { prisma } from "@/lib/prisma";
import { READY_COLUMN, type KanbanJobOrder, type ServiceBoard, type ProductionData } from "@/lib/production-board-types";

export { READY_COLUMN };
export type { KanbanJobOrder, ServiceBoard, ProductionData };

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Single source of truth for the Production module's board data (Production
 * UI implementation — extracted from what used to be inline in
 * production/page.tsx so the new Overview page and the new focused
 * per-service board page, app/(app)/production/board/[key]/page.tsx, read
 * the exact same real data rather than two independently-maintained
 * queries drifting apart). One `ServiceBoard` per active Service, each with
 * its own real WorkflowTemplate's columns — never a hardcoded universal
 * workflow (spec item 3's "do not hard-code one universal workflow for all
 * services").
 */
export async function getProductionData(canSeeAmount: boolean): Promise<ProductionData> {
  const [services, jobOrders, completedToday] = await Promise.all([
    prisma.service.findMany({
      where: { active: true },
      include: { workflowTemplate: { include: { stages: { orderBy: { order: "asc" } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.jobOrder.findMany({
      // RELEASED must still appear (in the Ready for Fulfillment column,
      // 1st Update item 1/3) rather than vanishing from the board the
      // instant it's released — a job order sat in this state before had
      // no visible path to actual completion anywhere in Production.
      where: { status: { in: ["IN_PROGRESS", "REWORK", "QC", "READY", "RELEASED"] }, order: { status: { not: "CANCELLED" } } },
      include: {
        order: { include: { customer: true, fulfillments: { orderBy: { createdAt: "desc" }, take: 1 } } },
        service: { include: { workflowTemplate: { include: { stages: { orderBy: { order: "asc" } } } } } },
        workflowTemplate: { include: { stages: { orderBy: { order: "asc" } } } },
        stageLogs: { orderBy: { createdAt: "desc" }, include: { assignedTo: true } },
      },
      orderBy: { deadline: "asc" },
    }),
    prisma.jobOrder.findMany({
      where: { status: "COMPLETED", completedAt: { gte: startOfToday() } },
      include: { order: { include: { customer: true } } },
      orderBy: { completedAt: "desc" },
      take: 25,
    }),
  ]);

  const now = Date.now();
  const boardsByKey = new Map<string, ServiceBoard>();

  function boardFor(key: string, label: string, serviceId: string | null, stages: { name: string; order: number; isDesignStage: boolean }[]): ServiceBoard {
    let board = boardsByKey.get(key);
    if (!board) {
      const columns =
        stages.length > 0
          ? [...stages.map((s) => ({ name: s.name, order: s.order, isDesignStage: s.isDesignStage })), { name: READY_COLUMN, order: stages.length + 1, isDesignStage: false }]
          : [];
      board = { key, label, serviceId, columns, jobOrders: [] };
      boardsByKey.set(key, board);
    }
    return board;
  }

  // Pre-create a board for every active service — even one with zero job
  // orders right now, or no production workflow assigned yet — so the
  // Overview always reflects the full, real Services module (spec item 9:
  // "once a service is successfully saved, it should automatically become
  // available in the Kanban," not just once it happens to have work).
  for (const s of services) {
    boardFor(s.id, s.name, s.id, s.workflowTemplate?.stages ?? []);
  }

  for (const jo of jobOrders) {
    const key = jo.serviceId && jo.service ? jo.serviceId : `wf:${jo.workflowTemplateId}`;
    const label = jo.service?.name ?? `${jo.workflowTemplate.name} (unlinked service)`;
    const stages = jo.serviceId && jo.service?.workflowTemplate ? jo.service.workflowTemplate.stages : jo.workflowTemplate.stages;
    const board = boardFor(key, label, jo.serviceId, stages);

    const currentLog = jo.stageLogs.find((l) => l.stageOrder === jo.currentStageOrder && l.status !== "COMPLETED");
    const column = jo.status === "READY" || jo.status === "RELEASED" ? READY_COLUMN : currentLog?.stageName ?? READY_COLUMN;
    const specs = (jo.specs as Record<string, string> | null) ?? null;
    const columnIndex = board.columns.findIndex((c) => c.name === column);
    const progressPct = board.columns.length > 1 && columnIndex >= 0 ? Math.round((columnIndex / (board.columns.length - 1)) * 100) : 0;
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
      priority: jo.priority,
      orderId: jo.orderId,
      orderNumber: jo.order.orderNumber,
      customerName: jo.order.customer.name,
      amount: canSeeAmount ? Number(jo.order.totalAmount) : null,
      courier: jo.order.fulfillments[0]?.courier ?? null,
      column,
      progressPct,
      currentLogId: currentLog?.id ?? null,
      currentLogStatus: currentLog?.status ?? null,
      isDesignStage: currentLog?.isDesignStage ?? false,
      assignedStaffId: currentLog?.assignedToId ?? null,
      assignedStaffName: currentLog?.assignedTo?.name ?? null,
      assignedStaffTitle: currentLog?.assignedTo?.title ?? null,
      updatedAt: jo.updatedAt.toISOString(),
    };
    board.jobOrders.push(item);
  }

  const boards = Array.from(boardsByKey.values());
  const allItems = boards.flatMap((b) => b.jobOrders);
  const stageCounts = {
    active: allItems.length,
    inProduction: allItems.filter((i) => i.status === "IN_PROGRESS" || i.status === "REWORK").length,
    inQc: allItems.filter((i) => i.status === "QC").length,
    ready: allItems.filter((i) => i.status === "READY" || i.status === "RELEASED").length,
    overdue: allItems.filter((i) => i.overdue).length,
  };

  const completedTodayItems = completedToday.map((jo) => ({
    id: jo.id,
    joNumber: jo.joNumber,
    productType: jo.productType,
    customerName: jo.order.customer.name,
    completedAt: (jo.completedAt ?? jo.updatedAt).toISOString(),
  }));

  return { boards, stageCounts, completedTodayItems };
}
