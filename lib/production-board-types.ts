/**
 * Pure types/constants for the Production module's board data — split out
 * of lib/production-board.ts (which imports `@/lib/prisma`, a server-only
 * module using the `pg` driver with Node built-in dependencies like `net`/
 * `tls`/`fs` that can't be bundled for the browser) so Client Components
 * can safely import `READY_COLUMN` and these types without accidentally
 * pulling `pg`/Prisma into the client bundle. A `type`-only import would
 * normally be elided by the bundler, but `READY_COLUMN` is a real runtime
 * value that several client components need — so the whole module
 * containing it has to be prisma-free, not just its types.
 */

/** Synthetic trailing column every board gets — a Job Order lands here once its workflow's last real stage is completed. Not a WorkflowStage row, so its `order` is always `stages.length + 1` and it's never a valid `expectedTargetStageOrder` target (that uses `null` instead — see completeCurrentStage's doc comment). */
export const READY_COLUMN = "Ready for Fulfillment";

export type KanbanJobOrder = {
  id: string;
  joNumber: string;
  productType: string;
  quantity: number;
  specs: [string, string][];
  deadline: string | null;
  /** When this job actually reached the Ready column (from its stage-log history) — only meaningful/populated for Ready-column cards. */
  readyAt: string | null;
  overdue: boolean;
  status: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  amount: number | null;
  courier: string | null;
  column: string;
  /** How far through this job's own workflow it has traveled (0-100), derived from real stage position — never a fabricated per-card estimate. */
  progressPct: number;
  currentLogId: string | null;
  currentLogStatus: string | null;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  updatedAt: string;
};

export type ServiceBoard = {
  /** Real Service.id, or `wf:${workflowTemplateId}` for the legacy fallback path (job orders predating the Service Master, no serviceId). Used as the /production/board/[key] route param — URI-encoded by callers since it can contain the "wf:" prefix. */
  key: string;
  label: string;
  serviceId: string | null;
  columns: { name: string; order: number }[];
  jobOrders: KanbanJobOrder[];
};

export type ProductionData = {
  boards: ServiceBoard[];
  stageCounts: { active: number; inProduction: number; inQc: number; ready: number; overdue: number };
  completedTodayItems: { id: string; joNumber: string; productType: string; customerName: string; completedAt: string }[];
};
