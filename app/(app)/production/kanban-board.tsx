"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  MessageCircle,
  FileText,
  AlertTriangle,
  ChevronRight,
  Package,
  Undo2,
  X,
  MoreVertical,
  LayoutGrid,
  List as ListIcon,
  SlidersHorizontal,
  Eye,
  ClipboardList,
  Paperclip,
  History,
  UserCog,
  Copy,
  ArrowRightLeft,
  ArrowLeft,
  Ban,
  Loader2,
  Calendar,
  Boxes,
} from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { PriorityFlag } from "@/components/ui/priority-flag";
import { renderStageIcon } from "@/lib/production-icons";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  startStageAction,
  moveStageAction,
  revertStageAction,
  returnToPreviousStageAction,
  duplicateJobOrderAction,
  type MoveStageResult,
  type JobOrderPanelData,
} from "@/app/actions/production";
import type { StageChangeUndo } from "@/lib/workflow";
import { READY_COLUMN, type KanbanJobOrder, type ServiceBoard } from "@/lib/production-board-types";
import { openTransactionInChatAction } from "@/app/actions/messages";
import { MessengerDispatchDialog } from "@/components/production/messenger-dispatch-dialog";
import { MoveConfirmDialog, type MoveConfirmRequest } from "@/components/production/move-confirm-dialog";
import { JobDetailsPanel, type Tab as PanelTab } from "@/components/production/job-details-panel";
import { ProductionMobileNav } from "@/components/production/production-mobile-nav";
import { ProductionRealtimeListener } from "@/components/production/production-realtime-listener";
import { QCModal } from "@/components/production/qc-modal";
import { ReadyForFulfillmentModal } from "@/components/production/ready-for-fulfillment-modal";

export { READY_COLUMN };

/** Colored header treatment per stage, cycling through a fixed palette by column position — a stage's real name is never assumed (services have different workflows), so this keys off position, not a hardcoded "Design/Printing/..." name list. The synthetic Ready column always gets the dedicated "ready" tone regardless of position. */
const STAGE_TONES = [
  { header: "bg-blue-50 text-blue-800 border-blue-100", badge: "bg-blue-100 text-blue-700" },
  { header: "bg-emerald-50 text-emerald-800 border-emerald-100", badge: "bg-emerald-100 text-emerald-700" },
  { header: "bg-amber-50 text-amber-800 border-amber-100", badge: "bg-amber-100 text-amber-700" },
  { header: "bg-purple-50 text-purple-800 border-purple-100", badge: "bg-purple-100 text-purple-700" },
];
const READY_TONE = { header: "bg-slate-100 text-slate-800 border-slate-200", badge: "bg-slate-200 text-slate-700" };
function toneFor(colName: string, index: number) {
  return colName === READY_COLUMN ? READY_TONE : STAGE_TONES[index % STAGE_TONES.length];
}


type ViewMode = "kanban" | "list";
type UndoState = { jobOrderId: string; joNumber: string; fromStage: string; toStage: string; undo: StageChangeUndo };

function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/**
 * Focused per-service production board (Production UI implementation,
 * illustration 2) — the client-side engine behind
 * /production/board/[key]. Historically (Aug 19/22 updates) this same file
 * exported a `KanbanBoard` that stacked *every* active service's board on
 * one page with a service-picker dropdown standing in for real navigation;
 * that conflated illustrations 1 and 2 into a single view. Splitting
 * Overview (service summary + "Open Board" links, app/(app)/production/
 * page.tsx) from this focused single-board view is what actually
 * implements the two distinct illustrated screens — this component now
 * owns exactly one `board`, reached by its own URL.
 *
 * Owns the one shared MoveConfirmDialog and JobDetailsPanel instance for
 * everything on this board — every move/return, whether triggered by a
 * card's primary button, its More Actions menu, drag-and-drop, or the side
 * panel's Next Actions, funnels through the same confirm-then-call path
 * (spec item 3: "Visual movement alone is not enough. The system must save
 * the stage change correctly").
 */
export function FocusedBoard({
  board,
  canUpdateStage,
  canMarkStageComplete,
  canDispatchMessenger,
  canAddJob,
  canSeeSettings,
  canSeeReports,
  currentUserName,
}: {
  board: ServiceBoard;
  canUpdateStage: boolean;
  canMarkStageComplete: boolean;
  canDispatchMessenger: boolean;
  canAddJob: boolean;
  canSeeSettings: boolean;
  canSeeReports: boolean;
  currentUserName: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [canDrag, setCanDrag] = useState(false);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);

  const [moveRequest, setMoveRequest] = useState<MoveConfirmRequest | null>(null);
  const [moveSubmitting, setMoveSubmitting] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ jo: KanbanJobOrder; targetOrder: number | null } | null>(null);

  const [panelJobOrderId, setPanelJobOrderId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab | undefined>(undefined);
  function openPanel(id: string, tab?: PanelTab) {
    setPanelJobOrderId(id);
    setPanelTab(tab);
  }

  const [qcModalJobOrderId, setQcModalJobOrderId] = useState<string | null>(null);
  const [readyModalJobOrderId, setReadyModalJobOrderId] = useState<string | null>(null);

  useEffect(() => {
    // Desktop gets real side-by-side drag-and-drop; tablet/mobile show one
    // stage at a time (spec item 6/7 — never a squeezed multi-column
    // layout below desktop width), so drag only makes sense at the
    // desktop tier.
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setCanDrag(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!undoState) return;
    const id = setTimeout(() => setUndoState(null), 10000);
    return () => clearTimeout(id);
  }, [undoState]);

  const allAssignees = useMemo(() => {
    const names = new Set<string>();
    board.jobOrders.forEach((j) => j.assignedStaffName && names.add(j.assignedStaffName));
    return Array.from(names).sort();
  }, [board]);

  const q = query.trim().toLowerCase();
  function matches(j: KanbanJobOrder) {
    if (q) {
      const hit = j.joNumber.toLowerCase().includes(q) || j.customerName.toLowerCase().includes(q) || j.productType.toLowerCase().includes(q) || j.orderNumber.toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (statusFilter && j.column !== statusFilter) return false;
    if (assignedFilter && j.assignedStaffName !== assignedFilter) return false;
    if (overdueOnly && !j.overdue) return false;
    return true;
  }

  const filteredBoard: ServiceBoard = useMemo(() => ({ ...board, jobOrders: board.jobOrders.filter(matches) }), [board, q, statusFilter, assignedFilter, overdueOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  function requestMove(jo: KanbanJobOrder, targetOrder: number | null, toStageName: string) {
    setMoveError(null);
    setPendingDrop({ jo, targetOrder });
    setMoveRequest({ kind: "move", jobOrderId: jo.id, joNumber: jo.joNumber, customerName: jo.customerName, quantity: jo.quantity, fromStage: jo.column, toStage: toStageName });
  }

  function requestReturn(jo: KanbanJobOrder, previousStageName: string) {
    setMoveError(null);
    setPendingDrop({ jo, targetOrder: null });
    setMoveRequest({ kind: "return", jobOrderId: jo.id, joNumber: jo.joNumber, customerName: jo.customerName, quantity: jo.quantity, fromStage: jo.column, toStage: previousStageName });
  }

  function requestMoveFromPanel(data: JobOrderPanelData, toStageName: string) {
    setPanelJobOrderId(null);
    setMoveError(null);
    setPendingDrop(null);
    const current = data.stages.find((s) => s.state === "current");
    setMoveRequest({ kind: "move", jobOrderId: data.id, joNumber: data.joNumber, customerName: data.customerName, quantity: data.quantity, fromStage: current?.name ?? "Current stage", toStage: toStageName });
  }

  function requestReturnFromPanel(data: JobOrderPanelData) {
    setPanelJobOrderId(null);
    setMoveError(null);
    setPendingDrop(null);
    const current = data.stages.find((s) => s.state === "current");
    setMoveRequest({ kind: "return", jobOrderId: data.id, joNumber: data.joNumber, customerName: data.customerName, quantity: data.quantity, fromStage: current?.name ?? "Current stage", toStage: data.previousStageName ?? "Previous stage" });
  }

  async function handleConfirmMove(reason?: string) {
    if (!moveRequest) return;
    setMoveSubmitting(true);
    setMoveError(null);

    if (moveRequest.kind === "return") {
      const result = await returnToPreviousStageAction(moveRequest.jobOrderId, reason ?? "");
      setMoveSubmitting(false);
      if (!result.ok) {
        setMoveError(result.error);
        return;
      }
      setMoveRequest(null);
      router.refresh();
      return;
    }

    // Forward move — prefer the exact stage log / target order captured by
    // the caller (drag-and-drop or a card/panel button already resolved
    // this from real board data); fall back to re-resolving from the
    // board's own current job list if the request came from the panel
    // (which only knows the destination stage's *name*, not its order).
    const jo = pendingDrop?.jo ?? board.jobOrders.find((j) => j.id === moveRequest.jobOrderId);
    if (!jo || !jo.currentLogId) {
      setMoveSubmitting(false);
      setMoveError("This job order can't be moved right now.");
      return;
    }
    let targetOrder: number | null;
    if (pendingDrop) {
      targetOrder = pendingDrop.targetOrder;
    } else {
      const targetCol = board.columns.find((c) => c.name === moveRequest.toStage);
      targetOrder = targetCol && targetCol.name !== READY_COLUMN ? targetCol.order : null;
    }
    const result: MoveStageResult = await moveStageAction(jo.id, jo.currentLogId, targetOrder);
    setMoveSubmitting(false);
    if (!result.ok) {
      setMoveError(result.error);
      return;
    }
    if (!result.undo.wasReworkCompletion) {
      setUndoState({ jobOrderId: jo.id, joNumber: jo.joNumber, fromStage: result.undo.fromStageName, toStage: result.undo.toStageName, undo: result.undo });
    }
    setMoveRequest(null);
    setPendingDrop(null);
    router.refresh();
  }

  async function handleUndo() {
    if (!undoState) return;
    const result = await revertStageAction(undoState.undo);
    setUndoState(null);
    if (!result.ok) {
      setDragError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ProductionRealtimeListener />
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative flex-1 sm:min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input placeholder="Search job orders, customers, products..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-40">
            <option value="">All Status</option>
            {board.columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)} className="sm:w-40">
            <option value="">All Assigned</option>
            {allAssignees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowMoreFilters((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </Button>

          <div className="ml-auto flex items-center gap-1 rounded-md border border-slate-200 p-0.5">
            <button type="button" onClick={() => setViewMode("kanban")} aria-label="Kanban view" className={cn("rounded p-1.5", viewMode === "kanban" ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-100")}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setViewMode("list")} aria-label="List view" className={cn("rounded p-1.5", viewMode === "list" ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-100")}>
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        {showMoreFilters && (
          <label className="flex items-center gap-2 border-t border-slate-100 pt-2 text-sm text-slate-600">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Overdue only
          </label>
        )}
      </div>

      {board.columns.length > 1 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {board.columns
            .filter((c) => c.name !== READY_COLUMN)
            .map((col, i) => {
              const tone = toneFor(col.name, i);
              const count = board.jobOrders.filter((j) => j.column === col.name).length;
              return (
                <div key={col.name} className={cn("rounded-lg border p-3", tone.header)}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                    {renderStageIcon(col.name, "h-3.5 w-3.5")} {col.name}
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {count} <span className="text-xs font-medium">job{count === 1 ? "" : "s"}</span>
                  </p>
                </div>
              );
            })}
        </div>
      )}

      {dragError && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{dragError}</span>
          <button type="button" onClick={() => setDragError(null)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {board.columns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
          No production workflow is assigned to this service yet.
        </div>
      ) : viewMode === "list" ? (
        <ListView items={filteredBoard.jobOrders.map((j) => ({ ...j, boardLabel: board.label }))} onOpenPanel={openPanel} />
      ) : (
        <SingleBoard
          board={filteredBoard}
          canUpdateStage={canUpdateStage}
          canMarkStageComplete={canMarkStageComplete}
          canDispatchMessenger={canDispatchMessenger}
          canAddJob={canAddJob}
          canDrag={canDrag}
          onRequestMove={requestMove}
          onRequestReturn={requestReturn}
          onOpenPanel={openPanel}
          onOpenQC={setQcModalJobOrderId}
          onOpenReady={setReadyModalJobOrderId}
          onDropError={setDragError}
        />
      )}

      {canUpdateStage && (
        <p className="hidden items-center gap-1.5 text-xs text-slate-400 lg:flex">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-brand-400" /> Drag and drop, or use the primary button on each job to move it forward
        </p>
      )}

      {undoState && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-900 px-4 py-2.5 text-sm text-white shadow-xl">
            <span>
              {undoState.joNumber}: {undoState.fromStage} → {undoState.toStage}
            </span>
            <button type="button" onClick={handleUndo} className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 font-medium hover:bg-white/20">
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
            <button type="button" onClick={() => setUndoState(null)} aria-label="Dismiss" className="text-white/60 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <MoveConfirmDialog
        request={moveRequest}
        submitting={moveSubmitting}
        error={moveError}
        onCancel={() => {
          setMoveRequest(null);
          setPendingDrop(null);
          setMoveError(null);
        }}
        onConfirm={handleConfirmMove}
      />

      <JobDetailsPanel
        jobOrderId={panelJobOrderId}
        initialTab={panelTab}
        onClose={() => { setPanelJobOrderId(null); setPanelTab(undefined); }}
        onRequestMove={requestMoveFromPanel}
        onRequestReturn={requestReturnFromPanel}
        onChanged={() => router.refresh()}
      />

      <QCModal
        jobOrderId={qcModalJobOrderId}
        currentUserName={currentUserName}
        onClose={() => setQcModalJobOrderId(null)}
        onDone={() => {
          setQcModalJobOrderId(null);
          router.refresh();
        }}
      />

      <ReadyForFulfillmentModal
        jobOrderId={readyModalJobOrderId}
        onClose={() => setReadyModalJobOrderId(null)}
        onDone={() => {
          setReadyModalJobOrderId(null);
          router.refresh();
        }}
      />

      <ProductionMobileNav canSeeSettings={canSeeSettings} canSeeReports={canSeeReports} />
    </div>
  );
}

function ListView({ items, onOpenPanel }: { items: (KanbanJobOrder & { boardLabel: string })[]; onOpenPanel: (id: string, tab?: PanelTab) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <Table>
        <THead>
          <TR>
            <TH>Job Order</TH>
            <TH>Customer</TH>
            <TH>Qty</TH>
            <TH>Priority</TH>
            <TH>Stage</TH>
            <TH>Progress</TH>
            <TH>Due</TH>
            <TH>Assigned</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {items.map((jo) => (
            <TR key={jo.id}>
              <TD>
                <button type="button" onClick={() => onOpenPanel(jo.id)} className="font-medium text-slate-900 underline decoration-slate-300 hover:decoration-slate-900">
                  {jo.joNumber}
                </button>
              </TD>
              <TD>{jo.customerName}</TD>
              <TD>{jo.quantity}</TD>
              <TD>
                <PriorityFlag priority={jo.priority} />
              </TD>
              <TD>
                <StatusBadge status={jo.status} />
              </TD>
              <TD>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${jo.progressPct}%` }} />
                  </div>
                  <span className="text-xs text-slate-400">{jo.progressPct}%</span>
                </div>
              </TD>
              <TD className={cn(jo.overdue && "font-medium text-red-600")}>{jo.deadline ? formatDate(jo.deadline) : "—"}</TD>
              <TD>{jo.assignedStaffName ?? "Unassigned"}</TD>
              <TD>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onOpenPanel(jo.id)}>
                  Details
                </Button>
              </TD>
            </TR>
          ))}
          {items.length === 0 && (
            <TR>
              <TD colSpan={9} className="py-8 text-center text-slate-400">
                No production jobs match this view.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}

/** The one column immediately after `fromColumn` in this board's own workflow — the only valid drag target, enforcing Rule #4 (no skipping) visually before the server enforces it again authoritatively. */
function nextColumnName(board: ServiceBoard, fromColumn: string): string | null {
  const idx = board.columns.findIndex((c) => c.name === fromColumn);
  if (idx === -1) return null;
  return board.columns[idx + 1]?.name ?? null;
}

function SingleBoard({
  board,
  canUpdateStage,
  canMarkStageComplete,
  canDispatchMessenger,
  canAddJob,
  canDrag,
  onRequestMove,
  onRequestReturn,
  onOpenPanel,
  onOpenQC,
  onOpenReady,
  onDropError,
}: {
  board: ServiceBoard;
  canUpdateStage: boolean;
  canMarkStageComplete: boolean;
  canDispatchMessenger: boolean;
  canAddJob: boolean;
  canDrag: boolean;
  onRequestMove: (jo: KanbanJobOrder, targetOrder: number | null, toStageName: string) => void;
  onRequestReturn: (jo: KanbanJobOrder, previousStageName: string) => void;
  onOpenPanel: (id: string, tab?: PanelTab) => void;
  onOpenQC: (id: string) => void;
  onOpenReady: (id: string) => void;
  onDropError: (msg: string | null) => void;
}) {
  const [activeStage, setActiveStage] = useState(board.columns[0]?.name ?? "");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    if (!board.columns.some((c) => c.name === activeStage) && board.columns[0]) setActiveStage(board.columns[0].name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.columns.map((c) => c.name).join("|")]);

  const draggingJo = board.jobOrders.find((j) => j.id === draggingId) ?? null;
  const validTargetName = draggingJo ? nextColumnName(board, draggingJo.column) : null;

  const commonColumnProps = {
    board,
    canUpdateStage,
    canMarkStageComplete,
    canDispatchMessenger,
    canAddJob,
    onRequestMove,
    onRequestReturn,
    onOpenPanel,
    onOpenQC,
    onOpenReady,
  };

  return (
    <>
      {/* Mobile (<640px): one stage at a time via a dropdown selector — never a squeezed multi-column layout (spec item 7). */}
      <div className="sm:hidden">
        <Select value={activeStage} onChange={(e) => setActiveStage(e.target.value)}>
          {board.columns.map((col) => (
            <option key={col.name} value={col.name}>
              {col.name} ({board.jobOrders.filter((j) => j.column === col.name).length})
            </option>
          ))}
        </Select>
        <StageColumn
          {...commonColumnProps}
          colName={activeStage}
          colIndex={board.columns.findIndex((c) => c.name === activeStage)}
          items={board.jobOrders.filter((j) => j.column === activeStage)}
          canDrag={false}
          isValidDropTarget={false}
          isDragActive={false}
          onDragStartCard={() => {}}
          onDragEndCard={() => {}}
          onDropCard={() => {}}
          className="mt-3"
        />
      </div>

      {/* Tablet (640-1023px): horizontal stage tabs, one stage's jobs shown full-width — not the desktop's cramped side-by-side columns (spec item 6). */}
      <div className="hidden sm:block lg:hidden">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
          {board.columns.map((col, i) => {
            const tone = toneFor(col.name, i);
            const count = board.jobOrders.filter((j) => j.column === col.name).length;
            return (
              <button
                key={col.name}
                type="button"
                onClick={() => setActiveStage(col.name)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium",
                  activeStage === col.name ? tone.header : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {renderStageIcon(col.name, "h-3.5 w-3.5")}
                {col.name}
                <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-semibold", activeStage === col.name ? tone.badge : "bg-slate-100 text-slate-500")}>{count}</span>
              </button>
            );
          })}
        </div>
        <StageColumn
          {...commonColumnProps}
          colName={activeStage}
          colIndex={board.columns.findIndex((c) => c.name === activeStage)}
          items={board.jobOrders.filter((j) => j.column === activeStage)}
          canDrag={false}
          isValidDropTarget={false}
          isDragActive={false}
          onDragStartCard={() => {}}
          onDragEndCard={() => {}}
          onDropCard={() => {}}
          className="mt-3"
          fullWidth
        />
      </div>

      {/* Desktop (≥1024px): real side-by-side columns with drag-and-drop. */}
      <div className="hidden gap-4 lg:flex lg:overflow-x-auto lg:pb-2">
        {board.columns.map((col, i) => (
          <StageColumn
            key={col.name}
            {...commonColumnProps}
            colName={col.name}
            colIndex={i}
            items={board.jobOrders.filter((j) => j.column === col.name)}
            canDrag={canDrag}
            isValidDropTarget={canDrag && validTargetName === col.name}
            isDragActive={!!draggingJo}
            onDragStartCard={(id) => setDraggingId(id)}
            onDragEndCard={() => setDraggingId(null)}
            onDropCard={(jo) => {
              if (validTargetName === col.name) {
                const targetCol = board.columns.find((c) => c.name === col.name)!;
                onRequestMove(jo, targetCol.name === READY_COLUMN ? null : targetCol.order, targetCol.name);
              } else {
                onDropError("That stage isn't the next step in this job order's workflow.");
              }
              setDraggingId(null);
            }}
            className="w-72 shrink-0 lg:w-80"
          />
        ))}
      </div>
    </>
  );
}

function StageColumn({
  board,
  colName,
  colIndex,
  items,
  canUpdateStage,
  canMarkStageComplete,
  canDispatchMessenger,
  canAddJob,
  canDrag,
  isValidDropTarget,
  isDragActive,
  onDragStartCard,
  onDragEndCard,
  onDropCard,
  onRequestMove,
  onRequestReturn,
  onOpenPanel,
  onOpenQC,
  onOpenReady,
  className,
  fullWidth,
}: {
  board: ServiceBoard;
  colName: string;
  colIndex: number;
  items: KanbanJobOrder[];
  canUpdateStage: boolean;
  canMarkStageComplete: boolean;
  canDispatchMessenger: boolean;
  canAddJob: boolean;
  canDrag: boolean;
  isValidDropTarget: boolean;
  isDragActive: boolean;
  onDragStartCard: (id: string) => void;
  onDragEndCard: () => void;
  onDropCard: (jo: KanbanJobOrder) => void;
  onRequestMove: (jo: KanbanJobOrder, targetOrder: number | null, toStageName: string) => void;
  onRequestReturn: (jo: KanbanJobOrder, previousStageName: string) => void;
  onOpenPanel: (id: string, tab?: PanelTab) => void;
  onOpenQC: (id: string) => void;
  onOpenReady: (id: string) => void;
  className?: string;
  fullWidth?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const tone = toneFor(colName, colIndex);

  return (
    <div
      className={cn(
        "rounded-lg border bg-slate-50 transition-colors",
        fullWidth && "w-full",
        isDragActive && isValidDropTarget && (dragOver ? "border-brand-500 bg-brand-50 ring-2 ring-brand-300" : "border-brand-300"),
        isDragActive && !isValidDropTarget && "opacity-50",
        !isDragActive && "border-slate-200",
        className
      )}
      onDragOver={(e) => {
        if (isValidDropTarget) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData("text/plain");
        const dropped = board.jobOrders.find((j) => j.id === id);
        if (dropped) onDropCard(dropped);
      }}
    >
      <div className={cn("flex items-center justify-between rounded-t-lg border-b p-3", tone.header)}>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide">
          {renderStageIcon(colName, "h-4 w-4")} {colName}
        </h3>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", tone.badge)}>{items.length}</span>
      </div>
      <div className={cn("space-y-2 overflow-y-auto p-2", fullWidth ? "max-h-none" : "max-h-[70dvh]")}>
        {items.map((jo) => (
          <JobOrderCard
            key={jo.id}
            jo={jo}
            board={board}
            canUpdateStage={canUpdateStage}
            canMarkStageComplete={canMarkStageComplete}
            canDispatchMessenger={canDispatchMessenger}
            canDrag={canDrag}
            onDragStart={onDragStartCard}
            onDragEnd={onDragEndCard}
            onRequestMove={onRequestMove}
            onRequestReturn={onRequestReturn}
            onOpenPanel={onOpenPanel}
            onOpenQC={onOpenQC}
            onOpenReady={onOpenReady}
          />
        ))}
        {items.length === 0 && (
          <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-slate-200 py-8 text-center">
            <Package className="h-5 w-5 text-slate-300" />
            <p className="text-xs text-slate-400">No jobs in this stage</p>
          </div>
        )}
      </div>
      {canAddJob && colName !== READY_COLUMN && (
        <div className="border-t border-slate-200 p-2">
          <button
            type="button"
            onClick={() => {
              const stage = board.columns.find((c) => c.name === colName);
              window.dispatchEvent(new CustomEvent("production:add-job", { detail: { serviceId: board.serviceId ?? undefined, stageOrder: stage?.order } }));
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            + Add Job to {colName}
          </button>
        </div>
      )}
    </div>
  );
}

function JobOrderCard({
  jo,
  board,
  canUpdateStage,
  canMarkStageComplete,
  canDispatchMessenger,
  canDrag,
  onDragStart,
  onDragEnd,
  onRequestMove,
  onRequestReturn,
  onOpenPanel,
  onOpenQC,
  onOpenReady,
}: {
  jo: KanbanJobOrder;
  board: ServiceBoard;
  canUpdateStage: boolean;
  canMarkStageComplete: boolean;
  canDispatchMessenger: boolean;
  canDrag: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onRequestMove: (jo: KanbanJobOrder, targetOrder: number | null, toStageName: string) => void;
  onRequestReturn: (jo: KanbanJobOrder, previousStageName: string) => void;
  onOpenPanel: (id: string, tab?: PanelTab) => void;
  onOpenQC: (id: string) => void;
  onOpenReady: (id: string) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [starting, setStarting] = useState(false);
  // Same precondition the "Next" button already required — a card only
  // becomes draggable once its current stage is actually in progress.
  // READY (not started yet) and QC cards keep their existing dedicated
  // controls instead (Start Stage / Go to QC) rather than a plain drag.
  const isDraggable = canDrag && jo.currentLogStatus === "IN_PROGRESS" && canMarkStageComplete;
  const colIndex = board.columns.findIndex((c) => c.name === jo.column);
  const nextCol = board.columns[colIndex + 1];
  const prevCol = colIndex > 0 ? board.columns[colIndex - 1] : null;
  const isReadyColumn = jo.column === READY_COLUMN;

  async function handleChat() {
    const { conversationId } = await openTransactionInChatAction("JOB_ORDER", jo.id);
    window.dispatchEvent(new CustomEvent("chatbox:open-reference", { detail: { conversationId, refType: "JOB_ORDER", refId: jo.id, refLabel: jo.joNumber } }));
  }

  async function handleDuplicate() {
    setMenuOpen(false);
    setDuplicating(true);
    await duplicateJobOrderAction(jo.id);
    setDuplicating(false);
  }

  // Starts the job's current stage (READY -> IN_PROGRESS). Deliberately
  // the same client-call + router.refresh() shape every other stage
  // action on this card already uses — see startStageAction's own doc
  // comment for why: this used to be a plain <form action={...}> Server
  // Action that redirected to /production on success, which was the root
  // cause of "Next Stage sometimes leaves the board, sometimes doesn't."
  async function handleStart() {
    if (!jo.currentLogId || starting) return;
    setStarting(true);
    await startStageAction(jo.currentLogId);
    setStarting(false);
    router.refresh();
  }

  return (
    <div
      draggable={isDraggable}
      onDragStart={(e) => {
        if (!isDraggable) return;
        e.dataTransfer.setData("text/plain", jo.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(jo.id);
      }}
      onDragEnd={onDragEnd}
      className={cn("space-y-2 rounded-lg border bg-white p-3 shadow-sm", jo.overdue ? "border-red-300" : "border-slate-200", isDraggable && "cursor-grab active:cursor-grabbing")}
    >
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => onOpenPanel(jo.id)} className="text-sm font-bold text-slate-900 underline decoration-slate-300 hover:decoration-slate-900">
          {jo.joNumber}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <StatusBadge status={jo.status} />
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="More options" className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-x-0 top-0 h-[100dvh] z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-slate-200 bg-white py-1 text-xs shadow-lg">
                  <Link href={`/job-orders/${jo.id}`} className="flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50">
                    <Eye className="h-3.5 w-3.5" /> View Job Order
                  </Link>
                  <button type="button" onClick={() => { setMenuOpen(false); onOpenPanel(jo.id, "Customer Form"); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50">
                    <ClipboardList className="h-3.5 w-3.5" /> View Customer Form
                  </button>
                  <button type="button" onClick={() => { setMenuOpen(false); onOpenPanel(jo.id, "Files"); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50">
                    <Paperclip className="h-3.5 w-3.5" /> View Files &amp; Attachments
                  </button>
                  <button type="button" onClick={() => { setMenuOpen(false); handleChat(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50">
                    <MessageCircle className="h-3.5 w-3.5" /> Send Message
                  </button>
                  <button type="button" onClick={() => { setMenuOpen(false); onOpenPanel(jo.id); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50">
                    <UserCog className="h-3.5 w-3.5" /> Reassign
                  </button>
                  <button type="button" onClick={() => { setMenuOpen(false); onOpenPanel(jo.id, "History"); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50">
                    <History className="h-3.5 w-3.5" /> View Production History
                  </button>
                  {canUpdateStage && (
                    <button type="button" onClick={handleDuplicate} disabled={duplicating} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      <Copy className="h-3.5 w-3.5" /> {duplicating ? "Duplicating…" : "Duplicate Job"}
                    </button>
                  )}
                  {!isReadyColumn && jo.status !== "QC" && canMarkStageComplete && nextCol && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onRequestMove(jo, nextCol.name === READY_COLUMN ? null : nextCol.order, nextCol.name);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" /> Move to Another Stage
                    </button>
                  )}
                  {!isReadyColumn && canUpdateStage && prevCol && jo.currentLogStatus !== "COMPLETED" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onRequestReturn(jo, prevCol.name);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Return to Previous Stage
                    </button>
                  )}
                  <div className="mt-1 border-t border-slate-100 pt-1">
                    <Link href={`/orders/${jo.orderId}`} className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50">
                      <Ban className="h-3.5 w-3.5" /> Cancel / Void Job
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="truncate text-sm text-slate-700">{jo.customerName}</p>
        <p className="truncate text-xs font-medium text-slate-500">{jo.productType}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Boxes className="h-3.5 w-3.5 text-slate-400" /> {jo.quantity} pcs
        </span>
        {isReadyColumn ? (
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-slate-400" /> Completed: {jo.readyAt ? formatDate(jo.readyAt) : "—"}
          </span>
        ) : (
          <span className={cn("flex items-center gap-1", jo.overdue && "font-medium text-red-600")}>
            {jo.overdue ? <AlertTriangle className="h-3.5 w-3.5" /> : <Calendar className="h-3.5 w-3.5 text-slate-400" />}
            {jo.overdue ? "Overdue" : "Due"}: {jo.deadline ? formatDate(jo.deadline) : "—"}
          </span>
        )}
        <PriorityFlag priority={jo.priority} />
      </div>

      {jo.specs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {jo.specs.map(([k, v]) => (
            <span key={k} className="rounded bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500">
              {k}: {v}
            </span>
          ))}
        </div>
      )}

      {jo.amount !== null && <p className="text-xs font-semibold text-slate-700">Total: {formatCurrency(jo.amount)}</p>}

      {!isReadyColumn && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${jo.progressPct}%` }} />
          </div>
          <p className="text-right text-[11px] text-slate-400">{jo.progressPct}%</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">{initials(jo.assignedStaffName)}</span>
          <span className="truncate text-xs text-slate-500">
            {jo.assignedStaffName ?? "Unassigned"}
            {jo.assignedStaffTitle && <span className="text-slate-400"> · {jo.assignedStaffTitle}</span>}
          </span>
        </div>
        {jo.courier && <p className="shrink-0 text-xs text-slate-400">Courier: {jo.courier}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onOpenPanel(jo.id)}>
          Details
        </Button>
        <Link href={`/job-orders/${jo.id}/print`} target="_blank">
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" aria-label="View document">
            <FileText className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" aria-label="Chat" onClick={handleChat}>
          <MessageCircle className="h-3.5 w-3.5" />
        </Button>
        {canDispatchMessenger && <MessengerDispatchDialog jobOrderId={jo.id} joNumber={jo.joNumber} />}

        <div className="ml-auto">
          {jo.status === "QC" ? (
            <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={() => onOpenQC(jo.id)}>
              Quality Control <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          ) : jo.status === "READY" || jo.status === "RELEASED" ? (
            <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={() => onOpenReady(jo.id)}>
              {jo.status === "RELEASED" ? "Complete Order" : "Release for Fulfillment"} <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          ) : jo.currentLogStatus === "READY" ? (
            canUpdateStage && (
              <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={handleStart} disabled={starting}>
                {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Start {jo.column}
              </Button>
            )
          ) : jo.currentLogStatus === "IN_PROGRESS" ? (
            canMarkStageComplete && (
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onRequestMove(jo, nextCol && nextCol.name !== READY_COLUMN ? nextCol.order : null, nextCol ? nextCol.name : READY_COLUMN)}
              >
                {nextCol && nextCol.name !== READY_COLUMN ? (
                  <>
                    Start {nextCol.name} <ChevronRight className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    Mark as Ready <ChevronRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
