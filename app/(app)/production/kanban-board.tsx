"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, MessageCircle, FileText, AlertTriangle, ChevronRight, Package } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { markStageInProgressAction } from "@/app/actions/production";
import { openTransactionInChatAction } from "@/app/actions/messages";
import { CompleteStageForm } from "./complete-stage-form";
import { MessengerDispatchDialog } from "@/components/production/messenger-dispatch-dialog";

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

/**
 * Production Kanban — columns are the actual configured WorkflowStage
 * sequence (reusing the existing WorkflowTemplate/WorkflowStage
 * architecture, not a new stage system), plus a trailing "Ready for
 * Fulfillment" column for job orders that finished their last stage.
 * Desktop/tablet: horizontal-scrolling stage columns. Mobile: a stage
 * selector narrows the board to one column at a time, avoiding sideways
 * scrolling through a whole row of narrow columns on a small screen.
 */
export function KanbanBoard({
  columns,
  jobOrders,
  canUpdateStage,
  canMarkStageComplete,
  canDispatchMessenger,
}: {
  columns: string[];
  jobOrders: KanbanJobOrder[];
  canUpdateStage: boolean;
  canMarkStageComplete: boolean;
  canDispatchMessenger: boolean;
}) {
  const services = useMemo(() => Array.from(new Set(jobOrders.map((j) => j.productType))).sort(), [jobOrders]);
  const [service, setService] = useState("");
  const [query, setQuery] = useState("");
  const [mobileStage, setMobileStage] = useState(columns[0] ?? "");

  const filtered = jobOrders.filter((j) => {
    if (service && j.productType !== service) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      if (
        !j.joNumber.toLowerCase().includes(q) &&
        !j.customerName.toLowerCase().includes(q) &&
        !j.productType.toLowerCase().includes(q) &&
        !j.orderNumber.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

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
        <Select value={service} onChange={(e) => setService(e.target.value)} className="sm:w-56">
          <option value="">All Services</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {/* Mobile: one stage at a time via a selector, avoiding sideways
          scrolling through a whole row of narrow columns. */}
      <div className="sm:hidden">
        <Select value={mobileStage} onChange={(e) => setMobileStage(e.target.value)}>
          {columns.map((col) => (
            <option key={col} value={col}>
              {col} ({filtered.filter((j) => j.column === col).length})
            </option>
          ))}
        </Select>
        <StageColumn
          col={mobileStage}
          items={filtered.filter((j) => j.column === mobileStage)}
          canUpdateStage={canUpdateStage}
          canMarkStageComplete={canMarkStageComplete}
          canDispatchMessenger={canDispatchMessenger}
          className="mt-3"
        />
      </div>

      <div className="hidden gap-4 sm:flex sm:overflow-x-auto sm:pb-2">
        {columns.map((col) => (
          <StageColumn
            key={col}
            col={col}
            items={filtered.filter((j) => j.column === col)}
            canUpdateStage={canUpdateStage}
            canMarkStageComplete={canMarkStageComplete}
            canDispatchMessenger={canDispatchMessenger}
            className="w-72 shrink-0"
          />
        ))}
      </div>
    </div>
  );
}

function StageColumn({
  col,
  items,
  canUpdateStage,
  canMarkStageComplete,
  canDispatchMessenger,
  className,
}: {
  col: string;
  items: KanbanJobOrder[];
  canUpdateStage: boolean;
  canMarkStageComplete: boolean;
  canDispatchMessenger: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-slate-200 bg-slate-50", className)}>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white p-3 rounded-t-lg">
        <h3 className="text-sm font-semibold text-slate-900">{col}</h3>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{items.length}</span>
      </div>
      <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
        {items.map((jo) => (
          <JobOrderCard
            key={jo.id}
            jo={jo}
            canUpdateStage={canUpdateStage}
            canMarkStageComplete={canMarkStageComplete}
            canDispatchMessenger={canDispatchMessenger}
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
  canUpdateStage,
  canMarkStageComplete,
  canDispatchMessenger,
}: {
  jo: KanbanJobOrder;
  canUpdateStage: boolean;
  canMarkStageComplete: boolean;
  canDispatchMessenger: boolean;
}) {
  const markIP = jo.currentLogId ? markStageInProgressAction.bind(null, jo.currentLogId) : undefined;

  async function handleChat() {
    const { conversationId } = await openTransactionInChatAction("JOB_ORDER", jo.id);
    window.dispatchEvent(
      new CustomEvent("chatbox:open-reference", {
        detail: { conversationId, refType: "JOB_ORDER", refId: jo.id, refLabel: jo.joNumber },
      })
    );
  }

  return (
    <div className={cn("space-y-2 rounded-md border bg-white p-3 shadow-sm", jo.overdue ? "border-red-300" : "border-slate-200")}>
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
            canMarkStageComplete &&
            jo.currentLogId && (
              <CompleteStageForm
                jobOrderId={jo.id}
                stageLogId={jo.currentLogId}
                compact
                label={
                  <>
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </>
                }
              />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
