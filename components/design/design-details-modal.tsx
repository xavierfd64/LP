"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PriorityFlag } from "@/components/ui/priority-flag";
import { formatDate } from "@/lib/utils";
import {
  getDesignJobDetailAction,
  acceptDesignJobAction,
  startDesignAction,
  completeDesignAction,
  type ActionResult,
} from "@/app/actions/design";
import type { DesignJobOrderDetail } from "@/lib/design-dashboard-data";

/**
 * "Design Details" (workflow spec item 11) — a professional details view
 * for one design job, reusing the app's standard Modal shell. Only shows
 * production-relevant fields (spec, quantity, files, instructions) — no
 * pricing/financial data ever reaches this props shape at all
 * (getDesignJobDetail never selects it), so there's nothing to
 * accidentally leak regardless of what permissions the viewer holds.
 */
export function DesignDetailsModal({
  stageLogId,
  onClose,
  onChanged,
}: {
  stageLogId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<DesignJobOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getDesignJobDetailAction(stageLogId).then((d) => {
      setDetail(d);
      setLoading(false);
    });
  }, [stageLogId]);

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      onChanged();
    });
  }

  return (
    <Modal open onClose={onClose} maxWidthClassName="max-w-2xl">
      <ModalHeader title={<>Design Details {detail && <span className="font-normal text-slate-500">{detail.joNumber}</span>}</>} onClose={onClose} />
      <ModalBody>
        {loading && <p className="py-6 text-center text-sm text-slate-400">Loading…</p>}
        {!loading && !detail && <Alert tone="error">This design job could not be found.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Order" value={detail.orderNumber} />
              <Field label="Customer" value={detail.customerName} />
              <Field label="Product / Service" value={detail.product} />
              <Field label="Quantity" value={String(detail.quantity)} />
              <Field label="Due Date" value={detail.deadline ? formatDate(detail.deadline) : "—"} />
              <Field label="Priority" value={<PriorityFlag priority={detail.priority} />} />
              <Field label="Current Stage" value={detail.stageName} />
              <Field label="Assigned To" value={detail.assignedToName ?? "Unassigned"} />
            </div>

            {detail.description && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Description</p>
                <p className="mt-0.5 text-slate-700">{detail.description}</p>
              </div>
            )}

            {!!detail.specs && typeof detail.specs === "object" && Object.keys(detail.specs as object).length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Specifications</p>
                <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                  {Object.entries(detail.specs as Record<string, string>).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2 border-b border-slate-100 py-0.5">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="text-slate-900">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {detail.productionInstructions && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Design / Production Instructions</p>
                <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{detail.productionInstructions}</p>
              </div>
            )}

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Files</p>
              {detail.files.length === 0 ? (
                <p className="mt-0.5 text-slate-400">No files uploaded yet.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {detail.files.map((f) => (
                    <li key={f.id}>
                      <a href={f.path} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                        {f.filename}
                      </a>{" "}
                      <span className="text-xs text-slate-400">({f.category.replace(/_/g, " ").toLowerCase()})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Link href={`/job-orders/${detail.jobOrderId}`} className="inline-block text-xs font-medium text-brand-600 underline">
              View full job order →
            </Link>
          </div>
        )}
      </ModalBody>
      {detail && detail.stageStatus !== "COMPLETED" && (
        <ModalFooter>
          {detail.stageStatus === "IN_PROGRESS" && (
            <div className="mr-auto flex-1">
              <label className="text-xs text-slate-500">Completion notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                placeholder="Anything the next stage should know…"
              />
            </div>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {detail.stageStatus === "READY" && (
            <>
              <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => acceptDesignJobAction(stageLogId))}>
                Accept Job
              </Button>
              <Button type="button" disabled={pending} onClick={() => run(() => startDesignAction(stageLogId))}>
                Start Design
              </Button>
            </>
          )}
          {detail.stageStatus === "IN_PROGRESS" && (
            <Button type="button" disabled={pending} onClick={() => run(() => completeDesignAction(detail.jobOrderId, stageLogId, notes || undefined))}>
              {pending ? "Completing…" : "Complete Design"}
            </Button>
          )}
        </ModalFooter>
      )}
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}
