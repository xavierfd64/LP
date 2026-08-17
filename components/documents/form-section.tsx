"use client";

/**
 * Client-safe counterpart to DocumentSection (components/documents/
 * document-shell.tsx) — same heading typography/spacing, for use inside the
 * editable Quotation/Order/Job Order preparation forms. Deliberately NOT
 * importing from document-shell.tsx: that file also exports the (server-
 * only, Business-Settings-reading) DocumentShell from the same module, and
 * a module that top-level-imports prisma can't be pulled into a Client
 * Component even for an unrelated named export.
 */
export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-700">{title}</h2>
      {children}
    </section>
  );
}
