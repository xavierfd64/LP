"use client";

import { useState } from "react";
import { deleteServiceAction } from "@/app/actions/services";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Permanent delete — separate from ToggleActiveButton's Deactivate/
 * Activate (2nd correction update). Deleting a Service that already has
 * Inquiries/Quotations/Job Orders on file is allowed: each of those keeps
 * its own snapshot of the service name independent of the live Service
 * row (see deleteServiceAction's doc comment), so history stays intact —
 * this dialog still warns clearly since the Service row itself is gone
 * for good. Uses the shared Modal (Sept 9 — Unified Modal Design System)
 * rather than a hand-rolled portal overlay.
 */
export function DeleteServiceButton({ serviceId, serviceName, jobOrderCount }: { serviceId: string; serviceName: string; jobOrderCount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-red-600 hover:underline">
        Delete
      </button>
      <Modal open={open} onClose={() => setOpen(false)} maxWidthClassName="max-w-sm">
        <ModalHeader title="Delete Service?" onClose={() => setOpen(false)} />
        <form action={deleteServiceAction.bind(null, serviceId)}>
          <ModalBody>
            <p className="text-sm text-slate-600">
              Are you sure you want to permanently delete <span className="font-medium text-slate-900">{serviceName}</span>? This
              cannot be undone, and it will no longer be available for new quotations, orders, or job orders.
            </p>
            {jobOrderCount > 0 && (
              <p className="text-sm text-slate-600">
                This service has been used on {jobOrderCount} job order{jobOrderCount === 1 ? "" : "s"}. Those records and their
                service name will remain intact — only the ability to select this service for new work is removed. If you might use
                it again later, Deactivate it instead.
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive">
              Delete
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
