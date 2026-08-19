"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, MessageCircle, FileText, AlertTriangle, ChevronRight, Package, Undo2, X } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { markStageInProgressAction, moveStageAction, revertStageAction, type MoveStageResult } from "@/app/actions/production";
import type { StageChangeUndo } from "@/lib/workflow";
import { openTransactionInChatAction } from "@/app/actions/messages";
import { MessengerDispatchDialog } from "@/components/production/messenger-dispatch-dialog";

/** Synthetic trailing column every board gets — a Job Order lands here once its workflow's last real stage is completed. Not a WorkflowStage row, so its `order` is always `stages.length + 1` and it's never a valid `expectedTargetStageOrder` target (that uses `null` instead — see completeCurrentStage's doc comment). */
export const READY_COLUMN = "Ready for Fulfillment";

export type KanbanJobOrder = {
  id: string;
  joNumber: string;
  productType: string;
  quantity: number;
  specs: [string, string][];
  deadline: string | null;
  overdue: boolean;
  status: string;
  orderNumber: string;
  customerName: string;
  amount: number | null;
  courier: string | null;
  column: string;
  currentLogId: string | null;
  currentLogStatus: string | null;
  assignedStaffName: string | null;
};

export type ServiceBoard = {
  key: string;
  label: string;
  columns: { name: string; order: number }[];
  jobOrders: KanbanJobOrder[];
};

type UndoState = { jobOrderId: string; joNumber: string; fromStage: string; toStage: string; undo: StageChangeUndo };

/**
 * Production Kanban (Aug 19 1st update). One `ServiceBoard` per active
 * Service, each with its own real workflow's columns — "All Services"
 * stacks every board rather than merging them into one fake universal
 * column set (spec item 12). Desktop/tablet (≥640px, matching this app's
 * existing sm: breakpoint) supports drag-and-drop between a job's current
 * stage and the one immediately after it in its own workflow; phones keep
 * the existing button controls. The ≥640px gate is a viewport-capability
 * check (matchMedia), not user-agent sniffing, mirroring how every other
 * responsive decision in this app is already made.
 */
export function KanbanBoard({
  boards,
  canUpdateStage,
  canMarkStageComplete,
  canDispatchMessenger,
}: {
  boards: ServiceBoard[];
  canUpdateStage: boolean;
  canMarkStageComplete: boolean;
  canDispatchMessenger: boolean;
}) {
  const router = useRouter();
  const [serviceKey, setServiceKey] = useState("");
  const [query, setQuery] = useState("");
  const [canDrag, setCanDrag] = useState(false);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
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

  const q = query.trim().toLowerCase();
  function matches(j: KanbanJobOrder) {
    if (!q) return true;
    return (
      j.joNumber.toLowerCase().includes(q) ||
      j.customerName.toLowerCase().includes(q) ||
      j.productType.toLowerCase().includes(q) ||
      j.orderNumber.toLowerCase().includes(q)
    );
  }

  const visibleBoards = useMemo(() => {
    const selected = serviceKey ? boards.filter((b) => b.key === serviceKey) : boards.filter((b) => b.jobOrders.length > 0);
    return selected.map((b) => ({ ...b, jobOrders: b.jobOrders.filter(matches) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards, serviceKey, q]);

  async function handleMove(jo: KanbanJobOrder, board: ServiceBoard, targetOrder: number | null) {
    if (!jo.currentLogId) return;
    setDragError(null);
    const result: MoveStageResult = await moveStageAction(jo.id, jo.currentLogId, targetOrder);
    if (!result.ok) {
      setDragError(result.error);
      return;
    }
    if (!result.undo.wasReworkCompletion) {
      setUndoState({ jobOrderId: jo.id, joNumber: jo.joNumber, fromStage: result.undo.fromStageName, toStage: result.undo.toStageName, undo: result.undo });
    }
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search job order, customer, service…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={serviceKey} onChange={(e) => setServiceKey(e.target.value)} className="sm:w-56">
          <option value="">All Services</option>
          {boards.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </Select>
      </div>

      {dragError && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{dragError}</span>
          <button type="button" onClick={() => setDragError(null)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {visibleBoards.length === 0 && (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-slate-200 py-10 text-center">
          <Package className="h-6 w-6 text-slate-300" />
          <p className="text-sm text-slate-400">No production jobs match this view.</p>
        </div>
      )}

      {visibleBoards.map((board) => (
        <div key={board.key} className="space-y-2">
          {!serviceKey && visibleBoards.length > 1 && (
            <h2 className="text-sm font-semibold text-slate-900">{board.label}</h2>
          )}
          <SingleBoard
            board={board}
            canUpdateStage={canUpdateStage}
            canMarkStageComplete={canMarkStageComplete}
            canDispatchMessenger={canDispatchMessenger}
            canDrag={canDrag}
            onMove={handleMove}
          />
        </div>
      ))}

      {undoState && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-900 px-4 py-2.5 text-sm text-white shadow-xl">
            <span>
              {undoState.joNumber}: {undoState.fromStage} → {undoState.toStage}
            </span>
            <button
              type="button"
              onClick={handleUndo}
              className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 font-medium hover:bg-white/20"
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
            <button type="button" onClick={() => setUndoState(null)} aria-label="Dismiss" className="text-white/60 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SingleBoard({
  board,
  canUpdateStage,
  canMarkStageComplete,
  canDispatchMessenger,
  canDrag,
  onMove,
}: {
  board: ServiceBoard;
  canUpdateStage: boolean;
  canMarkStageComplete: boolean;
  canDispatchMessenger: boolean;
  canDrag: boolean;
  onMove: (jo: KanbanJobOrder, board: ServiceBoard, targetOrder: number | null) => void;
}) {
  const [mobileStage, setMobileStage] = useState(board.columns[0]?.name ?? "");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const draggingJo = board.jobOrders.find((j) => j.id === draggingId) ?? null;
  const validTargetName = draggingJo ? nextColumnName(board, draggingJo.column) : null;

  if (board.columns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
        No production workflow is assigned to this service yet.
      </div>
    );
  }

  return (
    <>
      {/* Mobile: one stage at a time via a selector, existing button controls — no drag. */}
      <div className="sm:hidden">
        <Select value={mobileStage} onChange={(e) => setMobileStage(e.target.value)}>
          {board.columns.map((col) => (
            <option key={col.name} value={col.name}>
              {col.name} ({board.jobOrders.filter((j) => j.column === col.name).length})
            </option>
          ))}
        </Select>
        <StageColumn
          board={board}
          colName={mobileStage}
          items={board.jobOrders.filter((j) => j.column === mobileStage)}
          canUpdateStage={canUpdateStage}
          canMarkStageComplete={canMarkStageComplete}
          canDispatchMessenger={canDispatchMessenger}
          canDrag={false}
          isValidDropTarget={false}
          isDragActive={false}
          onDragStartCard={() => {}}
          onDragEndCard={() => {}}
          onDropCard={() => {}}
          onMove={onMove}
          className="mt-3"
        />
      </div>

      <div className="hidden gap-4 sm:flex sm:overflow-x-auto sm:pb-2">
        {board.columns.map((col) => (
          <StageColumn
            key={col.name}
            board={board}
            colName={col.name}
            items={board.jobOrders.filter((j) => j.column === col.name)}
            canUpdateStage={canUpdateStage}
            canMarkStageComplete={canMarkStageComplete}
            canDispatchMessenger={canDispatchMessenger}
            canDrag={canDrag}
            isValidDropTarget={canDrag && validTargetName === col.name}
            isDragActive={!!draggingJo}
            onDragStartCard={(id) => setDraggingId(id)}
            onDragEndCard={() => setDraggingId(null)}
            onDropCard={(jo) => {
              if (validTargetName === col.name) {
                const targetCol = board.columns.find((c) => c.name === col.name)!;
                onMove(jo, board, targetCol.name === READY_COLUMN ? null : targetCol.order);
              }
              setDraggingId(null);
            }}
            onMove={onMove}
            className="w-72 shrink-0"
          />
        ))}
      </div>
    </>
  );
}

/** The one column immediately after `fromColumn` in this board's own workflow — the only valid drag target, enforcing Rule #4 (no skipping) visually before the server enforces it again authoritatively. */
function nextColumnName(board: ServiceBoard, fromColumn: string): string | null {
  const idx = board.columns.findIndex((c) => c.name === fromColumn);
  if (idx === -1) return null;
  return board.columns[idx + 1]?.name ?? null;
}

function StageColumn({
  board,
  colName,
  items,
  canUpdateStage,
  canMarkStageComplete,
  canDispatchMessenger,
  canDrag,
  isValidDropTarget,
  isDragActive,
  onDragStartCard,
  onDragEndCard,
  onDropCard,
  onMove,
  className,
}: {
  board: ServiceBoard;
  colName: string;
  items: KanbanJobOrder[];
  canUpdateStage: boolean;
  canMarkStageComplete: boolean;
  canDispatchMessenger: boolean;
  canDrag: boolean;
  isValidDropTarget: boolean;
  isDragActive: boolean;
  onDragStartCard: (id: string) => void;
  onDragEndCard: () => void;
  onDropCard: (jo: KanbanJobOrder) => void;
  onMove: (jo: KanbanJobOrder, board: ServiceBoard, targetOrder: number | null) => void;
  className?: string;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={cn(
        "rounded-lg border bg-slate-50 transition-colors",
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
      <div className="flex items-center justify-between border-b border-slate-200 bg-white p-3 rounded-t-lg">
        <h3 className="text-sm font-semibold text-slate-900">{colName}</h3>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{items.length}</span>
      </div>
      <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
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
            onMove={onMove}
          />
        ))}
        {items.length === 0 && (
          <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-slate-200 py-8 text-center">
            <Package className="h-5 w-5 text-slate-300" />
            <p className="text-xs text-slate-400">No jobs in this queue</p>
          </div>
        )}
      </div>
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
  onMove,
}: {
  jo: KanbanJobOrder;
  board: ServiceBoard;
  canUpdateStage: boolean;
  canMarkStageComplete: boolean;
  canDispatchMessenger: boolean;
  canDrag: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMove: (jo: KanbanJobOrder, board: ServiceBoard, targetOrder: number | null) => void;
}) {
  const markIP = jo.currentLogId ? markStageInProgressAction.bind(null, jo.currentLogId) : undefined;
  // Same precondition the "Next" button already required — a card only
  // becomes draggable once its current stage is actually in progress.
  // READY (not started yet) and QC cards keep their existing dedicated
  // controls instead (Start Stage / Go to QC) rather than a plain drag.
  const isDraggable = canDrag && jo.currentLogStatus === "IN_PROGRESS" && canMarkStageComplete;
  const nextCol = board.columns[board.columns.findIndex((c) => c.name === jo.column) + 1];

  async function handleChat() {
    const { conversationId } = await openTransactionInChatAction("JOB_ORDER", jo.id);
    window.dispatchEvent(
      new CustomEvent("chatbox:open-reference", {
        detail: { conversationId, refType: "JOB_ORDER", refId: jo.id, refLabel: jo.joNumber },
      })
    );
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
      className={cn(
        "space-y-2 rounded-md border bg-white p-3 shadow-sm",
        jo.overdue ? "border-red-300" : "border-slate-200",
        isDraggable && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/job-orders/${jo.id}`} className="text-sm font-bold text-slate-900 underline decoration-slate-300 hover:decoration-slate-900">
            {jo.joNumber}
          </Link>
          <p className="truncate text-sm text-slate-700">{jo.customerName}</p>
        </div>
        <StatusBadge status={jo.status} />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span className="font-medium text-slate-700">{jo.productType}</span>
        <span>·</span>
        <span>Qty {jo.quantity}</span>
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

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className={cn("flex items-center gap-1", jo.overdue && "font-medium text-red-600")}>
          {jo.overdue && <AlertTriangle className="h-3 w-3" />}
          {jo.overdue ? "Overdue — " : "Due "}
          {jo.deadline ? formatDate(jo.deadline) : "—"}
        </span>
        <span>{jo.assignedStaffName ?? "Unassigned"}</span>
      </div>
      {jo.courier && <p className="text-xs text-slate-400">Courier: {jo.courier}</p>}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
        <Link href={`/job-orders/${jo.id}`}>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs">
            Details
          </Button>
        </Link>
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
            <Link href={`/job-orders/${jo.id}`}>
              <Button type="button" size="sm" className="h-7 px-2 text-xs">
                Go to QC
              </Button>
            </Link>
          ) : jo.currentLogStatus === "READY" ? (
            canUpdateStage &&
            markIP && (
              <form action={markIP}>
                <Button type="submit" size="sm" className="h-7 px-2 text-xs">
                  Start Stage
                </Button>
              </form>
            )
          ) : jo.currentLogStatus === "IN_PROGRESS" ? (
            canMarkStageComplete && (
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onMove(jo, board, nextCol && nextCol.name !== READY_COLUMN ? nextCol.order : null)}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
