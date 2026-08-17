import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { PublicOrderTracking } from "@/app/actions/public-tracking";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * The customer-safe order summary + progress timeline — shared by the
 * token-based /track/[token] page (polls for live updates) and the
 * homepage reference-number lookup (one-shot per submission). Only ever
 * renders fields already vetted as public-safe by buildPublicSnapshot; no
 * internal notes, costs, or other customers' data ever reach this props
 * shape in the first place.
 */
export function TrackingSnapshotCard({ data }: { data: PublicOrderTracking }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Order</p>
            <p className="text-lg font-bold text-slate-900">{data.orderNumber}</p>
          </div>
          <DocumentStatusBadge status={data.orderStatus} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Field label="Customer" value={data.customerName} />
          <Field label="Order Date" value={formatDate(data.orderDate)} />
          {data.service && <Field label="Service" value={data.service} />}
          {data.jobOrderNumber && <Field label="Job Order" value={data.jobOrderNumber} />}
          {data.quantity !== null && <Field label="Quantity" value={String(data.quantity)} />}
          <Field label="Payment Status" value={<DocumentStatusBadge status={data.paymentStatus} />} />
          {data.outstandingBalance !== null && data.outstandingBalance > 0 && (
            <Field label="Outstanding Balance" value={formatCurrency(data.outstandingBalance)} />
          )}
          {data.expectedDate && <Field label="Expected Completion" value={formatDate(data.expectedDate)} />}
          <Field label="Current Stage" value={data.currentStage ?? "—"} />
        </dl>
        {data.outstandingBalance !== null && data.outstandingBalance > 0 && (
          <div className="mt-3 rounded-md bg-brand-50 p-3 text-center">
            <p className="text-xs text-slate-600">
              {data.paymentStatus === "PARTIALLY_PAID" ? "A balance remains on this order." : "Payment is required to proceed."}
            </p>
            <p className="mt-1 text-xs text-slate-500">Please contact us or sign in to your account to make a payment.</p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-700">Order Progress</p>
        <ol className="space-y-0">
          {data.timeline.map((step, i) => (
            <li key={step.label} className="relative flex gap-3 pb-5 last:pb-0">
              {i < data.timeline.length - 1 && (
                <span
                  className="absolute left-[9px] top-5 h-full w-0.5"
                  style={{ backgroundColor: step.state === "done" ? "#dc2626" : "#e2e8f0" }}
                />
              )}
              <span className="z-10 shrink-0">
                {step.state === "done" ? (
                  <CheckCircle2 className="h-5 w-5 text-brand-600" />
                ) : step.state === "current" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
                ) : (
                  <Circle className="h-5 w-5 text-slate-300" />
                )}
              </span>
              <div>
                <p className={step.state === "upcoming" ? "text-sm text-slate-400" : "text-sm font-medium text-slate-900"}>
                  {step.label}
                </p>
                {step.date && <p className="text-xs text-slate-400">{formatDate(step.date)}</p>}
                {step.state === "current" && <p className="text-xs font-medium text-brand-600">In progress</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}
