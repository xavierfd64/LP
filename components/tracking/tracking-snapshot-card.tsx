"use client";

import { useState } from "react";
import { ArrowLeft, Calendar, CheckCircle2, Clock, Copy, Check, Loader2, Timer, MessageCircle } from "lucide-react";
import type { PublicOrderTracking } from "@/app/actions/public-tracking";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatDateTime, formatDuration, cn } from "@/lib/utils";
import { stageIcon, stageDescription } from "./stage-meta";

/**
 * The customer-safe order summary + progress timeline — shared by the
 * token-based /track/[token] page (polls for live updates) and the public
 * reference-number lookup (one-shot per submission). Only ever renders
 * fields already vetted as public-safe by buildPublicSnapshot; no internal
 * notes, costs, or other customers' data ever reach this props shape.
 *
 * `onBack` is a callback (not a Link) because the two callers need
 * different "back" semantics: the reference-lookup flow resets local
 * state to show the form again (no navigation, no refetch), while
 * /track/[token]'s page wraps this in a router.push("/track"). Both read
 * as "← Back" to the same place, just implemented differently underneath.
 */
export function TrackingSnapshotCard({ data, onBack, supportHref }: { data: PublicOrderTracking; onBack: () => void; supportHref: string | null }) {
  const lastUpdated = [...data.timeline].reverse().find((s) => s.date)?.date ?? data.orderDate;
  const isCompleted = data.orderStatus === "COMPLETED";
  // Order.completedAt is only ever set by the real completion code path
  // (see its own doc comment) — a completed order that predates that
  // field, or was seeded directly, can legitimately have it null. Falling
  // back to the timeline's own last dated event keeps both the current-
  // stage card and the duration below honest in that case, instead of
  // measuring "duration" against the moment the page happened to load.
  const effectiveCompletionDate = data.completedAt ?? lastUpdated;
  const currentStageDate = isCompleted ? effectiveCompletionDate : lastUpdated;
  const currentStageLabel = data.currentStage ?? (isCompleted ? "Completed" : "In Progress");
  const CurrentStageIcon = isCompleted ? CheckCircle2 : stageIcon(currentStageLabel);

  const subtitleBits = [data.service, data.quantity !== null ? `${data.quantity}pcs` : null].filter(Boolean);
  const subtitle = subtitleBits.length > 0 ? subtitleBits.join(" - ") : null;

  const startedAt = new Date(data.orderDate).getTime();
  const durationMs = isCompleted ? new Date(effectiveCompletionDate).getTime() - startedAt : Date.now() - startedAt;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header: reference + current-stage summary */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Order Status</h1>
            <div className="mt-1 flex items-center gap-2">
              <p className="truncate text-base font-semibold text-slate-900">{data.orderNumber}</p>
              <CopyButton value={data.orderNumber} />
            </div>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>

          <div
            className={cn(
              "shrink-0 rounded-lg border p-3 sm:min-w-[220px]",
              isCompleted ? "border-emerald-200 bg-emerald-50" : "border-brand-200 bg-brand-50"
            )}
          >
            <p className={cn("text-[11px] font-semibold uppercase tracking-wide", isCompleted ? "text-emerald-700" : "text-brand-700")}>
              Current Stage
            </p>
            <div className="mt-1 flex items-center gap-2">
              <CurrentStageIcon className={cn("h-5 w-5 shrink-0", isCompleted ? "text-emerald-600" : "text-brand-600")} />
              <p className="font-bold text-slate-900">{currentStageLabel}</p>
            </div>
            {currentStageDate && <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(currentStageDate)}</p>}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
          <Field label="Customer" value={data.customerName} />
          <Field label="Order Date" value={formatDate(data.orderDate)} />
          <Field label="Payment Status" value={<DocumentStatusBadge status={data.paymentStatus} />} />
          {data.jobOrderNumber && <Field label="Job Order" value={data.jobOrderNumber} />}
          {data.expectedDate && <Field label="Expected Completion" value={formatDate(data.expectedDate)} />}
          {data.outstandingBalance !== null && data.outstandingBalance > 0 && (
            <Field label="Outstanding Balance" value={formatCurrency(data.outstandingBalance)} />
          )}
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

      {/* Timeline */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-brand-700">Order Progress</p>
        <ol>
          {data.timeline.map((step, i) => {
            const isLast = i === data.timeline.length - 1;
            const Icon = stageIcon(step.label);
            return (
              <li key={`${step.label}-${i}`} className="flex gap-3.5">
                {/* Icon column: the connector is a sibling of the icon
                    WITHIN this same row, not a separately-positioned
                    overlay spanning the whole list. Because this column
                    (flex flex-col) stretches to the row's full height
                    (the row's own flex default is align-items: stretch)
                    and the connector below the icon is flex-1, it always
                    fills exactly the gap down to the next row's icon —
                    regardless of how tall this row's own content gets, and
                    with no separate gap-driven arithmetic that could ever
                    fall out of sync with it. */}
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      step.state === "upcoming" ? "bg-slate-200" : "bg-brand-600"
                    )}
                  >
                    {step.state === "current" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <Icon className={cn("h-4 w-4", step.state === "upcoming" ? "text-slate-500" : "text-white")} />
                    )}
                  </span>
                  {/* Flush against the icon above and the next row's icon
                      below (no my- margin) — any gap here is exactly the
                      kind of break the timeline must never show. */}
                  {!isLast && <div className="w-0.5 flex-1 bg-slate-200" aria-hidden="true" />}
                </div>

                <div className={cn("min-w-0 flex-1", !isLast && "pb-5")}>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className={cn("text-sm font-semibold", step.state === "upcoming" ? "text-slate-400" : "text-slate-900")}>{step.label}</p>
                    {step.state === "done" && (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Done
                      </span>
                    )}
                    {step.state === "current" && (
                      <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Current
                      </span>
                    )}
                  </div>
                  <p className={cn("text-xs", step.state === "upcoming" ? "text-slate-400" : "text-slate-500")}>
                    {stageDescription(step.label, step.state)}
                  </p>
                  {step.date && <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(step.date)}</p>}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Summary bar */}
        <div className="mt-2 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
          <SummaryItem icon={Calendar} label="Started" value={formatDateTime(data.orderDate)} />
          <SummaryItem icon={Clock} label={isCompleted ? "Completed" : "Status"} value={isCompleted ? formatDateTime(effectiveCompletionDate) : currentStageLabel} />
          <SummaryItem icon={Timer} label="Total Duration" value={formatDuration(durationMs)} />
        </div>
      </div>

      {data.messengerFollowLink && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-900">Follow Order Updates</p>
          <p className="mb-3 text-xs text-slate-500">Would you like to receive updates for this order through Messenger?</p>
          <a href={data.messengerFollowLink} target="_blank" rel="noreferrer">
            <Button type="button" variant="outline" className="w-full">
              <MessageCircle className="h-4 w-4" /> Follow via Messenger
            </Button>
          </a>
        </div>
      )}

      <div className="flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Need help with your order?</p>
          <p className="text-xs text-slate-500">If you have any questions, our support team is here to help.</p>
        </div>
        {supportHref ? (
          <a href={supportHref} className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full whitespace-nowrap sm:w-auto">
              Contact Support
            </Button>
          </a>
        ) : (
          <Button type="button" variant="outline" disabled className="w-full whitespace-nowrap sm:w-auto">
            Contact Support
          </Button>
        )}
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label="Copy order number"
      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
    >
      {copied ? <Check className="h-4 w-4 text-brand-600" /> : <Copy className="h-4 w-4" />}
    </button>
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

function SummaryItem({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-4 w-4 text-slate-500" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate font-medium text-slate-900">{value}</p>
      </div>
    </div>
  );
}
