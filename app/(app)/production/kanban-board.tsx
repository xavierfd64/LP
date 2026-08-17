"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { markStageInProgressAction } from "@/app/actions/production";
import { CompleteStageForm } from "./complete-stage-form";

export type KanbanJobOrder = {
  id: string;
  joNumber: string;
  productType: string;
  quantity: number;
  deadline: string | null;
  status: string;
  orderNumber: string;
  customerName: string;
  column: string;
  currentLogId: string | null;
  currentLogStatus: string | null;
  assignedStaffName: string | null;
};

/**
 * Visual Kanban production board — columns are the actual configured
 * WorkflowStage sequence (reusing the existing WorkflowTemplate/WorkflowStage
 * architecture, not a new stage system), plus a trailing "Ready for
 * Fulfillment" column for job orders that finished their last stage.
 * Desktop: horizontal scroll of fixed-width columns. Tablet: columns wrap.
 * Mobile: a single vertical stack, one stage section at a time.
 */
export function KanbanBoard({
  columns,
  jobOrders,
  canUpdateStage,
  canMarkStageComplete,
}: {
  columns: string[];
  jobOrders: KanbanJobOrder[];
  canUpdateStage: boolean;
  canMarkStageComplete: boolean;
}) {
  const services = useMemo(
    () => Array.from(new Set(jobOrders.map((j) => j.productType))).sort(),
    [jobOrders]
  );
  const [service, setService] = useState("");

  const filtered = service ? jobOrders.filter((j) => j.productType === service) : jobOrders;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-slate-700">Service</label>
        <Select value={service} onChange={(e) => setService(e.target.value)} className="w-auto">
          <option value="">All Services</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:overflow-x-auto sm:pb-2 lg:flex-nowrap">
        {columns.map((col) => {
          const items = filtered.filter((j) => j.column === col);
          return (
            <div key={col} className="w-full shrink-0 rounded-lg border border-slate-200 bg-slate-50 sm:w-72">
              <div className="flex items-center justify-between border-b border-slate-200 bg-white p-3">
                <h3 className="text-sm font-semibold text-slate-900">{col}</h3>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {items.length}
                </span>
              </div>
              <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
                {items.map((jo) => (
                  <JobOrderCard
                    key={jo.id}
                    jo={jo}
                    canUpdateStage={canUpdateStage}
                    canMarkStageComplete={canMarkStageComplete}
                  />
                ))}
                {items.length === 0 && <p className="p-2 text-xs text-slate-400">Nothing here.</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobOrderCard({
  jo,
  canUpdateStage,
  canMarkStageComplete,
}: {
  jo: KanbanJobOrder;
  canUpdateStage: boolean;
  canMarkStageComplete: boolean;
}) {
  const markIP = jo.currentLogId ? markStageInProgressAction.bind(null, jo.currentLogId) : undefined;

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/job-orders/${jo.id}`} className="text-sm font-semibold text-slate-900 underline">
          {jo.joNumber}
        </Link>
        <StatusBadge status={jo.status} />
      </div>
      <p className="text-sm text-slate-700">{jo.customerName}</p>
      <p className="text-xs text-slate-500">
        {jo.productType} · Qty {jo.quantity}
      </p>
      <p className="text-xs text-slate-500">Due {jo.deadline ? formatDate(jo.deadline) : "—"}</p>
      <p className="text-xs text-slate-500">Assigned: {jo.assignedStaffName ?? "Unassigned"}</p>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Link href={`/job-orders/${jo.id}`} className="text-xs font-medium text-brand-600 underline">
          View JO
        </Link>
        {jo.status === "QC" ? (
          <Link href={`/job-orders/${jo.id}`} className="text-xs font-medium text-blue-700 underline">
            Go to QC
          </Link>
        ) : jo.currentLogStatus === "READY" ? (
          canUpdateStage &&
          markIP && (
            <form action={markIP}>
              <Button type="submit" size="sm" variant="outline">
                Start Stage
              </Button>
            </form>
          )
        ) : jo.currentLogStatus === "IN_PROGRESS" ? (
          canMarkStageComplete &&
          jo.currentLogId && (
            <ApproveNextStageForm jobOrderId={jo.id} stageLogId={jo.currentLogId} />
          )
        ) : null}
      </div>
    </div>
  );
}

function ApproveNextStageForm({ jobOrderId, stageLogId }: { jobOrderId: string; stageLogId: string }) {
  return <CompleteStageForm jobOrderId={jobOrderId} stageLogId={stageLogId} label="Approve for Next Stage →" />;
}
