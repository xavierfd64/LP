"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  X,
  Expand,
  FileText,
  MessageCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Copy,
  ExternalLink,
  Info,
  ClipboardList,
  Paperclip,
  ClipboardCheck,
  History as HistoryIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { PriorityFlag } from "@/components/ui/priority-flag";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import { READY_COLUMN } from "@/lib/production-board-types";
import {
  getJobOrderPanelDataAction,
  getProductionStaffAction,
  reassignStageAction,
  duplicateJobOrderAction,
  type JobOrderPanelData,
  type ProductionStaffOption,
} from "@/app/actions/production";
import { openTransactionInChatAction } from "@/app/actions/messages";

const TABS = ["Overview", "Customer Form", "Files", "QC Checklist", "History", "Messages"] as const;
export type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, typeof Info> = {
  Overview: Info,
  "Customer Form": ClipboardList,
  Files: Paperclip,
  "QC Checklist": ClipboardCheck,
  History: HistoryIcon,
  Messages: MessageCircle,
};

const HISTORY_LABELS: Record<string, string> = {
  START_PRODUCTION: "Started production",
  STAGE_COMPLETED: "Stage completed",
  STAGE_CHANGE_REVERTED: "Move undone",
  STAGE_RETURNED: "Returned to previous stage",
  STAGE_REASSIGNED: "Reassigned",
  STAGE_STATUS_UPDATED: "Stage status updated",
  QC_RESULT_RECORDED: "QC result recorded",
  REWORK_CREATED: "Rework created",
  REWORK_CLOSED: "Rework closed",
  JOB_ORDER_DUPLICATED: "Duplicated from this job order",
};

/**
 * Job Details Side Panel (illustration 4) — "a fast management view
 * without unnecessarily navigating away from the board" (spec item 5).
 * Fetches everything in one call on open (getJobOrderPanelDataAction) and
 * renders it across the six tabs the spec lists; the two tabs that already
 * have a dedicated, more capable full page (Customer Form, QC Checklist)
 * show a real summary here plus a link out, rather than re-implementing
 * their forms — the panel augments those pages, it doesn't replace them.
 *
 * Move/Return actions are deliberately NOT handled locally: `onRequestMove`
 * /`onRequestReturn` bubble up to the focused board (FocusedBoard in
 * kanban-board.tsx), which owns the one shared MoveConfirmDialog instance
 * — so a move confirmed from the panel goes through the exact same
 * confirmation + server call as one confirmed from a card button or a
 * drag-and-drop drop, never a second, looser path.
 */
export function JobDetailsPanel({
  jobOrderId,
  initialTab,
  onClose,
  onRequestMove,
  onRequestReturn,
  onChanged,
}: {
  jobOrderId: string | null;
  initialTab?: Tab;
  onClose: () => void;
  onRequestMove: (data: JobOrderPanelData, toStageName: string) => void;
  onRequestReturn: (data: JobOrderPanelData) => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<JobOrderPanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [staff, setStaff] = useState<ProductionStaffOption[]>([]);
  const [reassigning, setReassigning] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicated, setDuplicated] = useState(false);

  useEffect(() => {
    if (!jobOrderId) return;
    setTab(initialTab ?? "Overview");
    setData(null);
    setLoading(true);
    Promise.all([getJobOrderPanelDataAction(jobOrderId), getProductionStaffAction()]).then(([d, s]) => {
      setData(d);
      setStaff(s);
      setLoading(false);
    });
  }, [jobOrderId, initialTab]);

  async function handleReassign(assigneeId: string) {
    if (!data) return;
    setReassigning(true);
    const result = await reassignStageAction(data.id, assigneeId || null);
    setReassigning(false);
    if (result.ok) {
      const refreshed = await getJobOrderPanelDataAction(data.id);
      setData(refreshed);
      onChanged();
    }
  }

  async function handleDuplicate() {
    if (!data) return;
    setDuplicating(true);
    const result = await duplicateJobOrderAction(data.id);
    setDuplicating(false);
    if (result.ok) {
      setDuplicated(true);
      onChanged();
    }
  }

  async function handleMessage() {
    if (!data) return;
    const { conversationId } = await openTransactionInChatAction("JOB_ORDER", data.id);
    window.dispatchEvent(
      new CustomEvent("chatbox:open-reference", { detail: { conversationId, refType: "JOB_ORDER", refId: data.id, refLabel: data.joNumber } })
    );
  }

  if (!jobOrderId) return null;

  const nextStage = data?.stages.find((s) => s.state === "upcoming");
  const isDone = !!data && (data.status === "READY" || data.status === "RELEASED" || data.status === "COMPLETED");
  // QC-stage jobs must go through the dedicated QC form (records
  // pass/fail counts + defect notes) rather than a plain forward move —
  // the generic move-confirm dialog never gets to bypass that (spec item
  // 10: "QC requirements must be enforced").
  const isAtQcStage = data?.status === "QC";

  return (
    <div className="fixed inset-x-0 top-0 h-[100dvh] z-40 flex justify-end bg-black/30" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl sm:max-w-lg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {data ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">{data.joNumber}</h2>
                  {data.overdue ? <Badge tone="red">Overdue</Badge> : <StatusBadge status={data.status} />}
                </div>
                <p className="text-xs text-slate-500">
                  {data.status.replace(/_/g, " ")} · {data.progressPct}% Complete
                </p>
              </>
            ) : (
              <h2 className="text-base font-bold text-slate-900">Loading…</h2>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {data && (
              <Link href={`/job-orders/${data.id}`} target="_blank" aria-label="Open full page" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <Expand className="h-4 w-4" />
              </Link>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex flex-1 items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {!loading && !data && (
          <div className="flex flex-1 items-center justify-center px-5 text-center text-sm text-slate-400">
            Couldn&apos;t load this job order.
          </div>
        )}

        {data && (
          <>
            <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-medium",
                    tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
                  )}
                >
                  {(() => {
                    const TabIcon = TAB_ICONS[t];
                    return <TabIcon className="h-3.5 w-3.5" />;
                  })()}
                  {t}
                </button>
              ))}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {tab === "Overview" && (
                <>
                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase text-slate-500">Job Information</p>
                      <Link href={`/job-orders/${data.id}`} className="text-xs text-brand-600 hover:underline">
                        View Job Order
                      </Link>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <Field label="Job Order #" value={data.joNumber} />
                      <Field label="Quantity" value={`${data.quantity} pcs`} />
                      <Field label="Service" value={data.productType} />
                      <Field label="Due Date" value={data.deadline ? formatDate(data.deadline) : "—"} tone={data.overdue ? "red" : undefined} />
                      <Field label="Customer" value={data.customerName} />
                      <Field label="Priority" value={<PriorityFlag priority={data.priority} />} />
                      <Field label="Order" value={data.orderNumber} />
                      <Field label="Created" value={formatDateTime(data.createdAt)} />
                    </div>
                  </section>

                  <section className="border-t border-slate-100 pt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase text-slate-500">Progress</p>
                      <span className="text-sm font-bold text-slate-900">{data.progressPct}%</span>
                    </div>
                    <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${data.progressPct}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {data.stages.map((s) => (
                        <div key={s.order} className="flex items-center gap-1.5 text-xs">
                          <span
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                              s.state === "done" && "bg-success-100 text-success-700",
                              s.state === "current" && "bg-brand-100 text-brand-700",
                              s.state === "upcoming" && "bg-slate-100 text-slate-400"
                            )}
                          >
                            {s.order}
                          </span>
                          <span className={cn(s.state === "current" ? "font-semibold text-slate-900" : "text-slate-500")}>{s.name}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="border-t border-slate-100 pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Assigned Staff</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-slate-800">
                        {data.assignedStaffName ?? "Unassigned"}
                        {data.assignedStaffTitle && <span className="text-slate-400"> · {data.assignedStaffTitle}</span>}
                      </span>
                      <Select
                        className="w-40"
                        value={data.assignedStaffId ?? ""}
                        onChange={(e) => handleReassign(e.target.value)}
                        disabled={reassigning || isDone}
                      >
                        <option value="">Unassigned</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </section>

                  {!isDone && (
                    <section className="border-t border-slate-100 pt-4">
                      <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Next Actions</p>
                      {isAtQcStage ? (
                        <Link href={`/job-orders/${data.id}`}>
                          <Button type="button" size="sm">
                            <ArrowRight className="h-3.5 w-3.5" /> Record QC Result
                          </Button>
                        </Link>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {nextStage ? (
                            <Button type="button" size="sm" onClick={() => onRequestMove(data, nextStage.name)}>
                              <ArrowRight className="h-3.5 w-3.5" /> Send to {nextStage.name}
                            </Button>
                          ) : (
                            <Button type="button" size="sm" onClick={() => onRequestMove(data, READY_COLUMN)}>
                              <ArrowRight className="h-3.5 w-3.5" /> Mark as Ready
                            </Button>
                          )}
                        </div>
                      )}
                      {data.canReturnToPrevious && (
                        <div className="mt-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => onRequestReturn(data)}>
                            <ArrowLeft className="h-3.5 w-3.5" /> Return to {data.previousStageName}
                          </Button>
                        </div>
                      )}
                    </section>
                  )}

                  <section className="border-t border-slate-100 pt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase text-slate-500">Recent Activity</p>
                      {data.history.length > 3 && (
                        <button type="button" onClick={() => setTab("History")} className="text-xs text-brand-600 hover:underline">
                          View all
                        </button>
                      )}
                    </div>
                    {data.history.length === 0 ? (
                      <p className="text-xs text-slate-400">No activity recorded yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {data.history.slice(0, 3).map((h) => (
                          <div key={h.id} className="flex items-start gap-2 text-xs">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800">{HISTORY_LABELS[h.action] ?? h.action.replace(/_/g, " ")}</p>
                              <p className="text-slate-400">
                                {h.actorName} · {formatDateTime(h.createdAt)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}

              {tab === "Customer Form" &&
                (data.customerForm ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-900">{data.customerForm.title}</p>
                    <p className="text-xs text-slate-500">
                      {data.customerForm.status === "SUBMITTED" ? "Submitted & Locked" : "Open — awaiting customer"} · {data.customerForm.itemCount} item(s)
                    </p>
                    <Link href={`/forms/${data.customerForm.id}`}>
                      <Button type="button" variant="outline" size="sm">
                        <ExternalLink className="h-3.5 w-3.5" /> Open Full Form
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No customer form has been generated for this job order.</p>
                ))}

              {tab === "Files" && (
                <div className="space-y-2">
                  {data.files.length === 0 && <p className="text-sm text-slate-400">No files uploaded yet.</p>}
                  {data.files.map((f) => (
                    <a key={f.id} href={f.path} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2 text-xs hover:bg-slate-50">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate font-medium text-slate-800">{f.filename}</span>
                        {f.isApproved && <Badge tone="green">Approved</Badge>}
                      </span>
                      <span className="shrink-0 text-slate-400">{f.uploadedByName}</span>
                    </a>
                  ))}
                  <Link href={`/job-orders/${data.id}`} className="mt-1 block text-xs text-brand-600 hover:underline">
                    Manage files on the full page →
                  </Link>
                </div>
              )}

              {tab === "QC Checklist" &&
                (data.qcChecklist?.hasChecklist ? (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-800">
                      {data.qcChecklist.checkedCount} of {data.qcChecklist.itemCount} items checked
                    </p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.round((data.qcChecklist.checkedCount / data.qcChecklist.itemCount) * 100)}%` }} />
                    </div>
                    <Link href={`/job-orders/${data.id}/qc-checklist`}>
                      <Button type="button" variant="outline" size="sm">
                        <ExternalLink className="h-3.5 w-3.5" /> Open QC Checklist
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No per-item QC checklist applies to this job order.</p>
                ))}

              {tab === "History" && (
                <div className="space-y-3">
                  {data.history.length === 0 && <p className="text-sm text-slate-400">No production history recorded yet.</p>}
                  {data.history.map((h) => (
                    <div key={h.id} className="flex items-start gap-2 text-xs">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">{HISTORY_LABELS[h.action] ?? h.action.replace(/_/g, " ")}</p>
                        <p className="text-slate-400">
                          {h.actorName} · {formatDateTime(h.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === "Messages" && (
                <div className="space-y-3 text-center">
                  <MessageCircle className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="text-sm text-slate-500">Discuss this job order with the customer or team.</p>
                  <Button type="button" variant="outline" size="sm" onClick={handleMessage}>
                    Open in Chat
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
              <Button type="button" variant="outline" size="sm" onClick={handleDuplicate} disabled={duplicating || duplicated}>
                {duplicating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                {duplicated ? "Duplicated" : "Duplicate Job"}
              </Button>
              <Link href={`/orders/${data.orderId}`} title="Cancelling voids the entire order and every job order on it">
                <Button type="button" variant="destructive" size="sm">
                  Cancel / Void Job
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "red" }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("truncate font-medium", tone === "red" ? "text-red-600" : "text-slate-900")}>{value}</p>
    </div>
  );
}
