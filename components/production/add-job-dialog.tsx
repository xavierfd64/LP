"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PriorityFlag } from "@/components/ui/priority-flag";
import { cn, formatDate } from "@/lib/utils";
import {
  getEligibleJobOrdersAction,
  getProductionStaffAction,
  addJobToProductionAction,
  type EligibleJobOrder,
  type ProductionStaffOption,
} from "@/app/actions/production";

export type AddJobServiceOption = {
  id: string;
  name: string;
  stages: { name: string; order: number }[];
};

/**
 * "Add Job to Production" dialog (illustration 7). One live-updating form —
 * the reference illustration numbers its sections 1-6 but lays them all out
 * on a single screen at once (desktop: 3-column grid; mobile: a stacked
 * bottom sheet), not a page-by-page wizard, so that's what this implements:
 * picking a service narrows the eligible-job-order list, picking a job
 * order auto-fills its info and the summary, and one "Add Job" button
 * submits everything together (spec item 8's numbered steps map onto
 * *validation order*, not separate screens).
 *
 * Deliberately operates on the same ON_HOLD "hasn't started production
 * yet" job orders the pre-existing Order-detail "Start Production" button
 * already requires (lib/workflow.ts's startProduction) — this dialog is a
 * second, more guided entry point into that exact same rule engine, never
 * a parallel one.
 *
 * Two mount modes: given `defaultServiceId` (opened from a specific
 * service's focused board — "+ Add Job to Stage" / a column's "+ Add Job")
 * the service is pre-selected and locked; opened from the Production
 * Overview (no default) step 1 is a live picker. Either way it also
 * listens for the global "production:add-job" event so the Production
 * mobile bottom nav's center Add Job button (which has no board context of
 * its own) can trigger it from anywhere in the module.
 */
export function AddJobDialog({
  services,
  defaultServiceId,
  defaultStageOrder,
  triggerLabel = "Add Job",
  triggerVariant = "default",
  triggerClassName,
}: {
  services: AddJobServiceOption[];
  defaultServiceId?: string;
  defaultStageOrder?: number;
  triggerLabel?: string;
  /** "default" — solid primary button (Overview/board headers). "block" — small full-width outline button (per-column "+ Add Job"). */
  triggerVariant?: "default" | "block";
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState(defaultServiceId ?? "");
  const [jobOrders, setJobOrders] = useState<EligibleJobOrder[]>([]);
  const [loadingJobOrders, setLoadingJobOrders] = useState(false);
  const [staff, setStaff] = useState<ProductionStaffOption[]>([]);
  const [query, setQuery] = useState("");
  const [selectedJobOrderId, setSelectedJobOrderId] = useState<string | null>(null);
  const [stageOrder, setStageOrder] = useState<number | undefined>(defaultStageOrder);
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset(nextServiceId?: string, nextStageOrder?: number) {
    const sid = nextServiceId ?? defaultServiceId ?? "";
    // Resolve the initial stage directly here rather than leaning on the
    // "auto-pick the first stage" effect below (keyed on `serviceId`
    // changing) — reopening this same dialog with the *same*
    // defaultServiceId (e.g. the board header's "+ Add Job to Stage",
    // which always pre-selects its own board's service) sets `serviceId`
    // to a value it already had, so that effect's dependency array never
    // detects a change and never fires, leaving `stageOrder` stuck at
    // whatever `reset()` last left it as (`undefined` on first open,
    // since no defaultStageOrder is passed there). The <select> would
    // still *visually* show its first option in that case — an unmatched
    // controlled value falls back to the browser's own default — masking
    // that `stageOrder` state was never actually set, which silently kept
    // the Add Job button disabled.
    const svc = services.find((s) => s.id === sid);
    setServiceId(sid);
    setQuery("");
    setSelectedJobOrderId(null);
    setStageOrder(nextStageOrder ?? svc?.stages[0]?.order);
    setAssigneeId("");
    setError(null);
    setSuccess(false);
  }

  useEffect(() => {
    function onExternalOpen(e: Event) {
      const detail = (e as CustomEvent).detail as { serviceId?: string; stageOrder?: number } | undefined;
      reset(detail?.serviceId, detail?.stageOrder);
      setOpen(true);
    }
    window.addEventListener("production:add-job", onExternalOpen);
    return () => window.removeEventListener("production:add-job", onExternalOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    getProductionStaffAction().then(setStaff);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoadingJobOrders(true);
    getEligibleJobOrdersAction(serviceId || undefined)
      .then((rows) => {
        setJobOrders(rows);
        // A previously-selected job order can go stale if it belongs to a
        // service the user just switched away from.
        setSelectedJobOrderId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : null));
      })
      .finally(() => setLoadingJobOrders(false));
  }, [open, serviceId]);

  const selectedService = services.find((s) => s.id === serviceId) ?? null;
  const stages = selectedService?.stages ?? [];
  useEffect(() => {
    if (stages.length === 0) return;
    if (!stages.some((s) => s.order === stageOrder)) setStageOrder(stages[0].order);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, stages.length]);

  const q = query.trim().toLowerCase();
  const filteredJobOrders = useMemo(() => {
    if (!q) return jobOrders;
    return jobOrders.filter(
      (j) => j.joNumber.toLowerCase().includes(q) || j.customerName.toLowerCase().includes(q) || j.productType.toLowerCase().includes(q)
    );
  }, [jobOrders, q]);

  const selectedJobOrder = jobOrders.find((j) => j.id === selectedJobOrderId) ?? null;
  const selectedStage = stages.find((s) => s.order === stageOrder) ?? null;
  const isFirstStage = stages.length > 0 && selectedStage?.order === stages[0].order;
  const canSubmit = !!serviceId && !!selectedJobOrder && !!selectedStage && !submitting;

  async function handleSubmit() {
    if (!selectedJobOrder || !selectedStage) return;
    setSubmitting(true);
    setError(null);
    const result = await addJobToProductionAction({
      jobOrderId: selectedJobOrder.id,
      initialStageOrder: selectedStage.order,
      assigneeId: assigneeId || null,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    router.refresh();
  }

  function close() {
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant === "block" ? "outline" : "default"}
        size="sm"
        className={cn(triggerVariant === "block" && "w-full text-xs", triggerClassName)}
        onClick={() => {
          reset(defaultServiceId, defaultStageOrder);
          setOpen(true);
        }}
      >
        <Plus className={triggerVariant === "block" ? "h-3.5 w-3.5" : "h-4 w-4"} /> {triggerLabel}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={close}>
          <div
            className="flex h-full w-full flex-col bg-white shadow-xl sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-lg"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Add Job to Production</h2>
                <p className="text-xs text-slate-500">Create a new job and add it to the workflow.</p>
              </div>
              <button type="button" onClick={close} className="shrink-0 text-slate-400 hover:text-slate-700" aria-label="Close">
                ✕
              </button>
            </div>

            {success && selectedJobOrder && selectedStage ? (
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-8 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-success-600" />
                <div>
                  <p className="text-base font-semibold text-slate-900">Job Added Successfully!</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedJobOrder.joNumber} has been added to {selectedStage.name}.
                  </p>
                </div>
                <div className="mx-auto max-w-sm space-y-1 rounded-md bg-slate-50 p-3 text-left text-sm">
                  <SummaryRow label="Service / Workflow" value={selectedService?.name ?? "—"} />
                  <SummaryRow label="Initial Stage" value={selectedStage.name} />
                  <SummaryRow label="Assigned To" value={staff.find((s) => s.id === assigneeId)?.name ?? "Unassigned"} />
                </div>
              </div>
            ) : (
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
                {error && (
                  <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <Label>1. Select Service / Workflow</Label>
                      <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)} disabled={!!defaultServiceId}>
                        <option value="">Select a service…</option>
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <Label>2. Select Job Order</Label>
                      <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input placeholder="Search by JO number, customer, product…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
                      </div>
                      <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-md border border-slate-200 p-1.5">
                        {loadingJobOrders && (
                          <p className="flex items-center gap-2 px-2 py-3 text-xs text-slate-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading eligible job orders…
                          </p>
                        )}
                        {!loadingJobOrders && filteredJobOrders.length === 0 && (
                          <p className="px-2 py-3 text-xs text-slate-400">
                            No job orders are ready to start production{serviceId ? " for this service" : ""}.
                          </p>
                        )}
                        {filteredJobOrders.map((j) => (
                          <button
                            type="button"
                            key={j.id}
                            onClick={() => setSelectedJobOrderId(j.id)}
                            className={cn(
                              "block w-full rounded-md border px-2.5 py-2 text-left text-xs",
                              selectedJobOrderId === j.id ? "border-brand-400 bg-brand-50" : "border-transparent hover:bg-slate-50"
                            )}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900">{j.joNumber}</span>
                              <span className="flex items-center gap-1.5">
                                {j.overdue && <Badge tone="red">Overdue</Badge>}
                                <PriorityFlag priority={j.priority} showLabel={false} />
                              </span>
                            </span>
                            <span className="mt-0.5 block text-slate-500">
                              {j.customerName} · {j.productType}
                            </span>
                            <span className="mt-0.5 block text-slate-400">
                              {j.quantity} pcs{j.deadline ? ` · Due ${formatDate(j.deadline)}` : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label>3. Job Information (Auto-filled)</Label>
                      {selectedJobOrder ? (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md bg-slate-50 p-3 text-xs">
                          <SummaryRow label="JO Number" value={selectedJobOrder.joNumber} />
                          <SummaryRow label="Quantity" value={`${selectedJobOrder.quantity} pcs`} />
                          <SummaryRow label="Customer" value={selectedJobOrder.customerName} />
                          <SummaryRow label="Due Date" value={selectedJobOrder.deadline ? formatDate(selectedJobOrder.deadline) : "—"} />
                          <SummaryRow label="Product" value={selectedJobOrder.productType} />
                          <SummaryRow label="Priority" value={<PriorityFlag priority={selectedJobOrder.priority} />} />
                          <SummaryRow label="Order" value={selectedJobOrder.orderNumber} />
                        </div>
                      ) : (
                        <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                          Select a job order to see its details.
                        </p>
                      )}
                    </div>

                    <div>
                      <Label>4. Initial Process / Stage</Label>
                      <Select value={stageOrder ?? ""} onChange={(e) => setStageOrder(Number(e.target.value))} disabled={stages.length === 0}>
                        {stages.length === 0 && <option value="">Select a service first</option>}
                        {stages.map((s) => (
                          <option key={s.order} value={s.order}>
                            {s.name} {s.order === stages[0]?.order ? "(First in workflow)" : ""}
                          </option>
                        ))}
                      </Select>
                      {selectedStage && !isFirstStage && (
                        <p className="mt-1 text-xs text-amber-700">
                          This job will start directly at {selectedStage.name}, skipping earlier stages in this workflow.
                        </p>
                      )}
                    </div>

                    <div>
                      <Label>5. Assign To</Label>
                      <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                        <option value="">Leave unassigned</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 p-3">
                  <Label>6. Job Summary</Label>
                  {selectedJobOrder && selectedStage ? (
                    <div className="space-y-1 text-xs">
                      <SummaryRow label="Service / Workflow" value={selectedService?.name ?? "—"} />
                      <SummaryRow label="Job Order" value={selectedJobOrder.joNumber} />
                      <SummaryRow label="Initial Stage" value={selectedStage.name} />
                      <SummaryRow label="Priority" value={<PriorityFlag priority={selectedJobOrder.priority} />} />
                      <SummaryRow label="Assigned To" value={staff.find((s) => s.id === assigneeId)?.name ?? "Unassigned"} />
                      <p className="pt-1 text-slate-500">The job will be added to the selected initial process and workflow.</p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">Complete the steps above to review the summary.</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              {success ? (
                <>
                  <Button type="button" variant="outline" onClick={close}>
                    Close
                  </Button>
                  {selectedService && (
                    <Button type="button" onClick={() => router.push(`/production/board/${encodeURIComponent(selectedService.id)}`)}>
                      Go to Board
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={close}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add Job
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <span className="truncate font-medium text-slate-900">{value}</span>
    </div>
  );
}
