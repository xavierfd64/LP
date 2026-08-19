import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared "document editor" visual language for the Inquiry/Quotation/Job
 * Order editable dashboard forms (spec Aug 19 2nd update, Part B/K) — a
 * large, spacious workspace instead of a narrow card, used identically by
 * all three document types so they "feel like one system" (item 29) while
 * each screen still only renders the fields/sections/actions relevant to
 * it. Deliberately plain (no hooks, no "use client") so both the Server
 * Component detail/view pages and the Client Component create/edit forms
 * can import it directly — same reasoning as components/documents/
 * form-section.tsx's FormSection, which this supersedes visually but
 * doesn't replace (FormSection is still used standalone in a few smaller
 * forms elsewhere).
 *
 * This is purely a layout/visual layer — it renders whatever children it's
 * given and has no opinion about business logic, permissions, or which
 * actions exist. The generated PDF/print templates (app/(print)/**) are a
 * separate presentation layer and are untouched by this update (spec item
 * 31/L).
 */
export function EditorShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl space-y-6", className)}>{children}</div>;
}

export function EditorHeader({
  eyebrow,
  title,
  subtitle,
  status,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">{eyebrow}</p>
        <h1 className="mt-1 truncate text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
        {status && <div className="mt-2">{status}</div>}
      </div>
      {actions && <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{actions}</div>}
    </div>
  );
}

/** Two columns on desktop (e.g. Customer Information | Document Information), stacked on mobile. */
export function EditorGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-5 lg:grid-cols-2", className)}>{children}</div>;
}

export function EditorPanel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-700">{title}</h2>
      {children}
    </section>
  );
}

/** A single label/value pair, used inside EditorPanel's read-only "Document Information" style blocks. */
export function InfoField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value ?? "—"}</p>
    </div>
  );
}

export type TotalsRow = { label: string; value: string; muted?: boolean; negative?: boolean };

/** Subtotal/Discount/Tax/Total/Amount Paid/Balance Due block (spec item 13/22) — right-aligned, prominent, used by both the Quotation and Order-derived views. */
export function TotalsPanel({ rows, total }: { rows: TotalsRow[]; total: TotalsRow }) {
  return (
    <div className="ml-auto w-full space-y-1.5 rounded-lg bg-slate-50 p-4 sm:w-80">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{r.label}</span>
          <span className={cn("font-medium", r.negative ? "text-error-600" : r.muted ? "text-slate-500" : "text-slate-900")}>
            {r.negative && !r.value.startsWith("-") ? `-${r.value}` : r.value}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
        <span>{total.label}</span>
        <span>{total.value}</span>
      </div>
    </div>
  );
}
