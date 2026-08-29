"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PriorityFlag } from "@/components/ui/priority-flag";
import { cn } from "@/lib/utils";
import type { DesignQueueRow } from "@/lib/design-dashboard-data";
import { acceptDesignJobAction, startDesignAction } from "@/app/actions/design";
import { DesignDetailsModal } from "./design-details-modal";
import { AssignDesignJobDialog } from "./assign-design-job-dialog";

function dueDateLabel(date: Date | null): { text: string; sub: string; overdue: boolean } {
  if (!date) return { text: "—", sub: "", overdue: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  const text = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (diffDays === 0) return { text, sub: "Today", overdue: false };
  if (diffDays < 0) return { text, sub: `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`, overdue: true };
  return { text, sub: `${diffDays} day${diffDays === 1 ? "" : "s"} left`, overdue: false };
}

const STATUS_BADGE: Record<DesignQueueRow["status"], { label: string; className: string }> = {
  READY: { label: "Waiting", className: "bg-slate-100 text-slate-600" },
  IN_PROGRESS: { label: "In Progress", className: "bg-brand-600 text-white" },
  COMPLETED: { label: "Done", className: "bg-emerald-50 text-emerald-700" },
};

export function DesignQueueTable({
  rows,
  canManage,
  emptyLabel,
}: {
  rows: DesignQueueRow[];
  canManage: boolean;
  emptyLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [assignRow, setAssignRow] = useState<DesignQueueRow | null>(null);

  function run(stageLogId: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyId(stageLogId);
    setError(null);
    startTransition(async () => {
      const res = await action();
      setBusyId(null);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      // The acting Graphic Artist's own tab needs to see the result
      // immediately — router.refresh() re-runs this Server Component page
      // with fresh data, same pattern established elsewhere (Quotation
      // Details popup, Production Kanban) for "no manual refresh" actions.
      router.refresh();
    });
  }

  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH>Order / Reference</TH>
            <TH>Customer</TH>
            <TH>Product</TH>
            <TH>Due Date</TH>
            <TH>Priority</TH>
            <TH>Status</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => {
            const due = dueDateLabel(r.dueDate);
            const badge = STATUS_BADGE[r.status];
            const isBusy = pending && busyId === r.stageLogId;
            return (
              <TR key={r.stageLogId}>
                <TD>
                  <p className="font-medium text-brand-600">{r.joNumber}</p>
                  <p className="text-xs text-slate-400">{r.orderNumber}</p>
                </TD>
                <TD>{r.customerName}</TD>
                <TD>
                  {r.product}
                  <p className="text-xs text-slate-400">Qty {r.quantity}</p>
                </TD>
                <TD>
                  <p className={due.overdue ? "font-medium text-red-600" : ""}>{due.text}</p>
                  {due.sub && <p className={cn("text-xs", due.overdue ? "text-red-500" : "text-slate-400")}>{due.sub}</p>}
                </TD>
                <TD>
                  <PriorityFlag priority={r.priority} />
                </TD>
                <TD>
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", badge.className)}>
                    {badge.label}
                  </span>
                  {r.status !== "COMPLETED" && !r.isMine && r.assignedToId && (
                    <p className="mt-0.5 text-xs text-slate-400">Assigned to {r.assignedToName}</p>
                  )}
                </TD>
                <TD>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {r.status === "READY" && !r.assignedToId && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => run(r.stageLogId, () => acceptDesignJobAction(r.stageLogId))}
                      >
                        {isBusy ? "Accepting…" : "Accept Job"}
                      </Button>
                    )}
                    {r.status === "READY" && (r.isMine || !r.assignedToId) && (
                      <Button type="button" size="sm" disabled={isBusy} onClick={() => run(r.stageLogId, () => startDesignAction(r.stageLogId))}>
                        {isBusy ? "Starting…" : "Start Design"}
                      </Button>
                    )}
                    {r.status === "IN_PROGRESS" && r.isMine && (
                      <Button type="button" size="sm" onClick={() => setDetailsId(r.stageLogId)}>
                        Continue Working
                      </Button>
                    )}
                    {canManage && r.status !== "COMPLETED" && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setAssignRow(r)}>
                        Assign
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={() => setDetailsId(r.stageLogId)}>
                      View Details
                    </Button>
                  </div>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {rows.length === 0 && <EmptyState label={emptyLabel} />}
      {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}
      {detailsId && (
        <DesignDetailsModal
          stageLogId={detailsId}
          onClose={() => setDetailsId(null)}
          onChanged={() => {
            setDetailsId(null);
            router.refresh();
          }}
        />
      )}
      {assignRow && <AssignDesignJobDialog row={assignRow} onClose={() => setAssignRow(null)} onAssigned={() => { setAssignRow(null); router.refresh(); }} />}
    </>
  );
}
