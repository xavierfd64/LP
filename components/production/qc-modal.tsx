"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getQCPopupDataAction, type QCPopupData } from "@/app/actions/qc";
import { QCForm } from "@/app/(app)/job-orders/[id]/qc-form";
import { QcChecklistView } from "@/app/(app)/job-orders/[id]/qc-checklist/qc-checklist-view";

/**
 * QC popup/modal (1st Update item 2) — replaces navigating to a separate
 * page when a job card's QC action is clicked. Reuses the two existing QC
 * implementations verbatim (QCForm for a plain aggregate result, or
 * QcChecklistView for a per-item Customer Form checklist — the same
 * Jersey-order flow that already existed) rather than building a third:
 * getQCPopupDataAction decides which one applies, exactly like the job
 * order page's own inline check already did.
 */
export function QCModal({
  jobOrderId,
  currentUserName,
  onClose,
  onDone,
}: {
  jobOrderId: string | null;
  currentUserName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [data, setData] = useState<QCPopupData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobOrderId) return;
    setData(null);
    setNotFound(false);
    setLoadError(null);
    setLoading(true);
    getQCPopupDataAction(jobOrderId)
      .then((d) => {
        if (!d) setNotFound(true);
        else setData(d);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Unable to load QC details."))
      .finally(() => setLoading(false));
  }, [jobOrderId]);

  if (!jobOrderId) return null;

  function handleResult(result: { ok: true } | { ok: false; error: string }) {
    if (result.ok) onDone();
  }

  return (
    <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-stretch justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:h-auto sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Quality Control</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <p className="py-10 text-center text-sm text-slate-400">Loading…</p>}
          {notFound && <p className="py-10 text-center text-sm text-slate-400">Job order not found.</p>}
          {loadError && <p className="py-10 text-center text-sm text-red-600">{loadError}</p>}

          {data?.mode === "checklist" && (
            <QcChecklistView
              jobOrder={data.jobOrder}
              items={data.items}
              currentUserName={currentUserName}
              embedded
              onComplete={handleResult}
            />
          )}

          {data?.mode === "simple" && (
            <QCForm
              jobOrderId={data.jobOrderId}
              quantity={data.quantity}
              stages={data.stages}
              defaultAssignedStage={data.defaultAssignedStage ?? undefined}
              onComplete={handleResult}
            />
          )}
        </div>
      </div>
    </div>
  );
}
