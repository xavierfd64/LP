"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

export type CompletedTodayItem = {
  id: string;
  joNumber: string;
  productType: string;
  customerName: string;
  completedAt: string;
};

/**
 * "Completed Today" summary card (Aug 22 Production redesign). "View
 * history →" opens a real list of today's completed Job Orders — since
 * this app has no standalone completed-job-orders history page, that list
 * (already fetched for the card's own count) is shown inline rather than
 * linking out to a page that doesn't exist.
 */
export function CompletedTodayCard({ count, items }: { count: number; items: CompletedTodayItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Card className="h-full">
        <CardContent className="py-4">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-success-100 text-success-600">
            <CheckCircle2 className="h-4.5 w-4.5" />
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Completed Today</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 lg:text-3xl">{count}</p>
        </CardContent>
      </Card>
      <button type="button" onClick={() => setOpen(true)} className="absolute bottom-4 left-4 text-xs font-medium text-brand-600 hover:underline">
        View history →
      </button>

      <Modal open={open} onClose={() => setOpen(false)} maxWidthClassName="max-w-lg">
        <ModalHeader title="Completed Today" subtitle={`${count} job order${count === 1 ? "" : "s"} completed today`} onClose={() => setOpen(false)} />
        <ModalBody>
          {items.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No job orders completed yet today.</p>}
          {items.map((jo) => (
            <div key={jo.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
              <div className="min-w-0">
                <Link href={`/job-orders/${jo.id}`} className="text-sm font-semibold text-slate-900 underline decoration-slate-300 hover:decoration-slate-900">
                  {jo.joNumber}
                </Link>
                <p className="truncate text-xs text-slate-500">
                  {jo.customerName} · {jo.productType}
                </p>
              </div>
              <span className="shrink-0 text-xs text-slate-400">{formatDateTime(jo.completedAt)}</span>
            </div>
          ))}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
