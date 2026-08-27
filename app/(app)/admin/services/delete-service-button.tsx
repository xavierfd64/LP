"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { deleteServiceAction } from "@/app/actions/services";
import { Button } from "@/components/ui/button";

/**
 * Permanent delete — separate from ToggleActiveButton's Deactivate/
 * Activate (2nd correction update). Deleting a Service that already has
 * Inquiries/Quotations/Job Orders on file is allowed: each of those keeps
 * its own snapshot of the service name independent of the live Service
 * row (see deleteServiceAction's doc comment), so history stays intact —
 * this dialog still warns clearly since the Service row itself is gone
 * for good.
 */
export function DeleteServiceButton({ serviceId, serviceName, jobOrderCount }: { serviceId: string; serviceName: string; jobOrderCount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-red-600 hover:underline">
        Delete
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-sm max-h-[85dvh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Delete Service?</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-slate-600">
                Are you sure you want to permanently delete <span className="font-medium text-slate-900">{serviceName}</span>? This
                cannot be undone, and it will no longer be available for new quotations, orders, or job orders.
              </p>
              {jobOrderCount > 0 && (
                <p className="mt-2 text-sm text-slate-600">
                  This service has been used on {jobOrderCount} job order{jobOrderCount === 1 ? "" : "s"}. Those records and their
                  service name will remain intact — only the ability to select this service for new work is removed. If you might use
                  it again later, Deactivate it instead.
                </p>
              )}
              <form action={deleteServiceAction.bind(null, serviceId)} className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive">
                  Delete
                </Button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
