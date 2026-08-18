"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Loader2, Copy, Check, Home } from "lucide-react";
import type { PublicOrderTracking } from "@/app/actions/public-tracking";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatDateTime, cn } from "@/lib/utils";

/**
 * The customer-safe order summary + progress timeline — shared by the
 * token-based /track/[token] page (polls for live updates) and the
 * homepage reference-number lookup (one-shot per submission). Only ever
 * renders fields already vetted as public-safe by buildPublicSnapshot; no
 * internal notes, costs, or other customers' data ever reach this props
 * shape in the first place.
 *
 * UX shape (copy-to-clipboard reference number, DONE/CURRENT step badges,
 * a "Back To Home" action) follows a customer-shared reference screenshot
 * of a third-party tracking page — deliberately kept in this app's own
 * Red + White + Montserrat system, not the reference's purple branding.
 */
export function TrackingSnapshotCard({ data }: { data: PublicOrderTracking }) {
  const lastUpdated =
    [...data.timeline].reverse().find((s) => s.date)?.date ?? data.orderDate;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Order Number</p>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-lg font-bold text-slate-900">{data.orderNumber}</p>
              <CopyButton value={data.orderNumber} />
            </div>
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
        {/* Icon and connector live in their own flex column, stretched by
            the flex row to the same height as the content column on their
            right — the browser computes each segment's length from actual
            layout, so it always reaches exactly to the next icon no matter
            how tall a given step's content is. This avoids the previous
            absolute-positioned line (anchored with a fixed top + height:100%
            of each <li>'s own auto height), which broke visibly wherever a
            step's box was taller or shifted than its neighbors — most
            visibly at the "current" step, whose left border was also
            widening that one row and throwing off alignment further. The
            border/background emphasis for the current step now lives only
            on the content column, so it can never shift the icon/line
            column's position. */}
        <ol>
          {data.timeline.map((step, i) => {
            const isLast = i === data.timeline.length - 1;
            return (
              <li key={step.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="shrink-0 bg-white">
                    {step.state === "done" ? (
                      <CheckCircle2 className="h-5 w-5 text-brand-600" />
                    ) : step.state === "current" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-300" />
                    )}
                  </span>
                  {!isLast && (
                    <span
                      className="mt-1 w-0.5 flex-1"
                      style={{ backgroundColor: step.state === "done" ? "#dc2626" : "#e2e8f0", minHeight: "1.5rem" }}
                    />
                  )}
                </div>
                <div
                  className={cn(
                    "min-w-0 flex-1 rounded-md px-2 py-1.5",
                    isLast ? "pb-1.5" : "pb-4",
                    step.state === "current" && "-ml-2 border-l-4 border-brand-600 bg-brand-50 pl-3"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={step.state === "upcoming" ? "text-sm text-slate-400" : "text-sm font-medium text-slate-900"}>
                      {step.label}
                    </p>
                    {step.state === "done" && (
                      <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                        Done
                      </span>
                    )}
                    {step.state === "current" && (
                      <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Current
                      </span>
                    )}
                  </div>
                  {step.date && <p className="text-xs text-slate-400">{formatDate(step.date)}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <p>
          <span className="font-medium text-slate-700">Last Updated:</span> {formatDateTime(lastUpdated)}
        </p>
      </div>

      <Link href="/">
        <Button type="button" variant="outline" className="w-full">
          <Home className="h-4 w-4" /> Back To Home
        </Button>
      </Link>
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
