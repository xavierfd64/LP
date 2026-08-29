import { prisma } from "@/lib/prisma";
import type { JobOrderPriority, StageLogStatus } from "@/app/generated/prisma/client";

export type DesignQueueRow = {
  stageLogId: string;
  jobOrderId: string;
  joNumber: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  product: string;
  quantity: number;
  dueDate: Date | null;
  priority: JobOrderPriority;
  status: StageLogStatus;
  assignedToId: string | null;
  assignedToName: string | null;
  isMine: boolean;
  createdAt: Date;
};

const ROW_INCLUDE = {
  jobOrder: { include: { order: { include: { customer: true } } } },
  assignedTo: true,
} as const;

function toRow(log: {
  id: string;
  jobOrderId: string;
  status: StageLogStatus;
  assignedToId: string | null;
  assignedTo: { name: string } | null;
  createdAt: Date;
  jobOrder: {
    joNumber: string;
    productType: string;
    quantity: number;
    deadline: Date | null;
    priority: JobOrderPriority;
    orderId: string;
    order: { orderNumber: string; customer: { name: string } };
  };
}, userId: string): DesignQueueRow {
  return {
    stageLogId: log.id,
    jobOrderId: log.jobOrderId,
    joNumber: log.jobOrder.joNumber,
    orderId: log.jobOrder.orderId,
    orderNumber: log.jobOrder.order.orderNumber,
    customerName: log.jobOrder.order.customer.name,
    product: log.jobOrder.productType,
    quantity: log.jobOrder.quantity,
    dueDate: log.jobOrder.deadline,
    priority: log.jobOrder.priority,
    status: log.status,
    assignedToId: log.assignedToId,
    assignedToName: log.assignedTo?.name ?? null,
    isMine: log.assignedToId === userId,
    createdAt: log.createdAt,
  };
}

/** "My Design Queue" — waiting work: assigned to me and not yet started,
 * plus anything still unclaimed and available to accept. Never another
 * Graphic Artist's already-accepted-but-not-started job — that's theirs,
 * not "available." `allArtists` (DESIGN_MANAGE only — see /design-queue's
 * page-level check) widens this to every Graphic Artist's waiting work,
 * not just this viewer's own, so a lead/admin can actually see what there
 * is to manually assign. */
export async function getDesignQueueRows(userId: string, allArtists = false): Promise<DesignQueueRow[]> {
  const logs = await prisma.jobOrderStageLog.findMany({
    where: {
      isDesignStage: true,
      status: "READY",
      ...(allArtists ? {} : { OR: [{ assignedToId: userId }, { assignedToId: null }] }),
    },
    include: ROW_INCLUDE,
    orderBy: [{ jobOrder: { deadline: "asc" } }, { createdAt: "asc" }],
  });
  return logs.map((l) => toRow(l, userId));
}

/** "In Progress" — active work; my own unless `allArtists` (DESIGN_MANAGE)
 * widens it to every Graphic Artist's (starting always assigns, so
 * there's no such thing as an unclaimed in-progress design log). */
export async function getDesignInProgressRows(userId: string, allArtists = false): Promise<DesignQueueRow[]> {
  const logs = await prisma.jobOrderStageLog.findMany({
    where: { isDesignStage: true, status: "IN_PROGRESS", ...(allArtists ? {} : { assignedToId: userId }) },
    include: ROW_INCLUDE,
    orderBy: [{ jobOrder: { deadline: "asc" } }, { startedAt: "asc" }],
  });
  return logs.map((l) => toRow(l, userId));
}

/** "Completed" — my own design history, or (DESIGN_MANAGE) everyone's.
 * The linked order/job order keeps moving through the rest of the real
 * lifecycle after this, so this list is a record of *design* history, not
 * the order's current overall state (shown separately per row via the
 * order's real status). */
export async function getDesignCompletedRows(userId: string, limit = 50, allArtists = false): Promise<DesignQueueRow[]> {
  const logs = await prisma.jobOrderStageLog.findMany({
    where: { isDesignStage: true, status: "COMPLETED", ...(allArtists ? {} : { assignedToId: userId }) },
    include: ROW_INCLUDE,
    orderBy: { completedAt: "desc" },
    take: limit,
  });
  return logs.map((l) => toRow(l, userId));
}

export type DesignDashboardSummary = {
  linedUp: number;
  inProgress: number;
  completedToday: number;
  dueToday: number;
};

export async function getDesignDashboardSummary(userId: string): Promise<DesignDashboardSummary> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [linedUp, inProgress, completedToday, dueToday] = await Promise.all([
    prisma.jobOrderStageLog.count({
      where: { isDesignStage: true, status: "READY", OR: [{ assignedToId: userId }, { assignedToId: null }] },
    }),
    prisma.jobOrderStageLog.count({ where: { isDesignStage: true, status: "IN_PROGRESS", assignedToId: userId } }),
    prisma.jobOrderStageLog.count({
      where: { isDesignStage: true, status: "COMPLETED", assignedToId: userId, completedAt: { gte: startOfToday, lt: endOfToday } },
    }),
    prisma.jobOrderStageLog.count({
      where: {
        isDesignStage: true,
        status: { in: ["READY", "IN_PROGRESS"] },
        assignedToId: userId,
        jobOrder: { deadline: { gte: startOfToday, lt: endOfToday } },
      },
    }),
  ]);

  return { linedUp, inProgress, completedToday, dueToday };
}

export type DesignJobOrderDetail = {
  jobOrderId: string;
  joNumber: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  product: string;
  description: string;
  specs: unknown;
  quantity: number;
  deadline: Date | null;
  priority: JobOrderPriority;
  productionInstructions: string | null;
  stageName: string;
  stageStatus: StageLogStatus;
  assignedToName: string | null;
  files: { id: string; filename: string; path: string; category: string; createdAt: Date }[];
};

/** Design Details popup data — deliberately excludes cost/financial
 * fields (pricing, payments) the way the rest of this Graphic Artist
 * surface does; only what a Graphic Artist needs to actually do the
 * layout, plus enough order/customer context to identify it. */
export async function getDesignJobDetail(stageLogId: string): Promise<DesignJobOrderDetail | null> {
  const log = await prisma.jobOrderStageLog.findUnique({
    where: { id: stageLogId },
    include: {
      assignedTo: true,
      jobOrder: {
        include: {
          order: { include: { customer: true } },
          files: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!log || !log.isDesignStage) return null;

  return {
    jobOrderId: log.jobOrderId,
    joNumber: log.jobOrder.joNumber,
    orderId: log.jobOrder.orderId,
    orderNumber: log.jobOrder.order.orderNumber,
    customerName: log.jobOrder.order.customer.name,
    product: log.jobOrder.productType,
    description: log.jobOrder.description,
    specs: log.jobOrder.specs,
    quantity: log.jobOrder.quantity,
    deadline: log.jobOrder.deadline,
    priority: log.jobOrder.priority,
    productionInstructions: log.jobOrder.productionInstructions,
    stageName: log.stageName,
    stageStatus: log.status,
    assignedToName: log.assignedTo?.name ?? null,
    files: log.jobOrder.files.map((f) => ({ id: f.id, filename: f.filename, path: f.path, category: f.category, createdAt: f.createdAt })),
  };
}
