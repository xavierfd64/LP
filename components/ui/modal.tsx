"use client";

import { cn } from "@/lib/utils";

/**
 * The first real shared Modal primitive in this app — until now every
 * modal (RecordPaymentModal, ExportPaymentsDialog) duplicated the same
 * fixed-overlay/centered-card shell inline, which was fine for one caller
 * each. With Inquiry/Quotation/Order detail views all needing the same
 * shell (Aug 22 UI redesign update 2), duplicating it a third time
 * stopped being reasonable — this extracts exactly that existing shape,
 * changing no visual behavior for the callers migrated to it.
 */
export function Modal({
  open,
  onClose,
  children,
  maxWidthClassName = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        className={cn("flex max-h-[90vh] w-full flex-col rounded-lg bg-white shadow-xl", maxWidthClassName)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  subtitle,
  badge,
  onClose,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {badge}
        </div>
        {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-700" aria-label="Close">
        ✕
      </button>
    </div>
  );
}

export function ModalBody({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 overflow-y-auto px-5 py-4">{children}</div>;
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">{children}</div>;
}
