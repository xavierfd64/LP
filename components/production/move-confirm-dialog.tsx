"use client";

import { useState } from "react";
import { ArrowRight, ArrowLeft, Loader2, AlertTriangle, Lock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";

export type MoveConfirmRequest =
  | { kind: "move"; jobOrderId: string; joNumber: string; customerName: string; quantity: number; fromStage: string; toStage: string }
  | { kind: "return"; jobOrderId: string; joNumber: string; customerName: string; quantity: number; fromStage: string; toStage: string };

/**
 * Move / Undo confirmation (illustration 8). Forward moves ("Move to Next
 * Process") need no reason — matches the illustration's own forward-move
 * dialog, which has no text field at all — while returning a job to a
 * previous process always requires one (illustration 8B: "Require a reason
 * when the business rules require one" — lib/workflow.ts's
 * returnToPreviousStage enforces this same requirement server-side, this
 * is just the matching UI gate so the Confirm button can't even be pressed
 * empty). Used for both the Kanban's drag-and-drop drop and its button
 * actions — "Visual movement alone is not enough" (spec item 3) is
 * enforced by this dialog being the *only* path either interaction takes
 * to actually call the server action.
 *
 * When the server rejects the attempt, this switches to the illustration's
 * distinct "Cannot Move Job" / "Cannot Return Job" presentation (lock icon,
 * bulleted reasons, single Close button) instead of leaving the Confirm/
 * Cancel form up with an inline error banner underneath it — matching
 * section C of illustration 8 rather than approximating it with a banner.
 */
export function MoveConfirmDialog({
  request,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  request: MoveConfirmRequest | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = useState("");

  if (!request) return null;
  const isReturn = request.kind === "return";
  const blocked = !!error;

  return (
    // Mobile gets a bottom-anchored sheet (illustration 8's own "MOBILE
    // (Bottom Sheet)" responsive example) rather than the AddJobDialog's
    // full-height-screen pattern — this dialog's content is short, and
    // stretching it to fill the viewport left a large empty gap above the
    // footer that looked broken rather than intentional.
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 sm:items-center sm:justify-center sm:p-4" onMouseDown={onCancel}>
      <div
        className="flex max-h-[85vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:max-w-md sm:rounded-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {blocked ? (
          <>
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-900">{isReturn ? "Cannot Return Job" : "Cannot Move Job"}</h2>
              <button type="button" onClick={onCancel} className="shrink-0 text-slate-400 hover:text-slate-700" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
                <Lock className="h-6 w-6" />
              </span>
              <p className="text-sm font-semibold text-slate-900">
                {isReturn ? "This job cannot be returned to the previous process." : "This job cannot be moved to the next process."}
              </p>
              <ul className="mx-auto max-w-xs space-y-1.5 text-left text-xs text-slate-600">
                <li className="flex items-start gap-1.5">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-400" /> {error}
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-400" /> Please check the job status or your permissions.
                </li>
              </ul>
            </div>
            <div className="flex justify-end border-t border-slate-100 px-5 py-3">
              <Button type="button" variant="outline" onClick={onCancel}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-center gap-2">
                {isReturn ? <ArrowLeft className="h-5 w-5 shrink-0 text-amber-600" /> : <ArrowRight className="h-5 w-5 shrink-0 text-success-600" />}
                <h2 className="min-w-0 text-base font-bold text-slate-900">{isReturn ? "Return to Previous Process" : "Move to Next Process"}</h2>
              </div>
              <button type="button" onClick={onCancel} className="shrink-0 text-slate-400 hover:text-slate-700" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-slate-200 p-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Current Process</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">{request.fromStage}</p>
                </div>
                <div className={`rounded-md border p-2.5 ${isReturn ? "border-amber-200 bg-amber-50" : "border-success-200 bg-success-50"}`}>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">{isReturn ? "Return To" : "Move To"}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">{request.toStage}</p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-900">{request.joNumber}</span>
                <span className="text-slate-500">
                  {request.customerName} · {request.quantity} pcs
                </span>
              </div>

              <p className={`flex items-start gap-1.5 rounded-md px-3 py-2 text-xs ${isReturn ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"}`}>
                {isReturn ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>
                  {isReturn
                    ? "Returning this job will reopen the previous stage and may affect downstream work already started."
                    : "This action will move the job forward. Progress and history will be recorded."}
                </span>
              </p>

              {isReturn && (
                <div>
                  <Label htmlFor="return-reason">Reason for returning (required)</Label>
                  <Textarea id="return-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why this job is going back a stage…" />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="button"
                variant={isReturn ? "destructive" : "default"}
                onClick={() => onConfirm(isReturn ? reason : undefined)}
                disabled={submitting || (isReturn && !reason.trim())}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : isReturn ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                {isReturn ? "Confirm Return" : "Confirm Move"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
