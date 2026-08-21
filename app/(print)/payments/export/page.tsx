import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DocumentShell, DocumentSection } from "@/components/documents/document-shell";
import { getPaymentsForExport, getPaymentsExportSummary, type PaymentExportRow } from "@/lib/payments-list";
import { PAYMENT_EXPORT_COLUMNS, DEFAULT_EXPORT_COLUMNS, type PaymentExportColumnKey } from "@/lib/payment-export-columns";
import type { PaymentFilterPeriod } from "@/lib/payment-filter-periods";

/**
 * PDF export for the Payments page (spec item 4's "PDF — best for sharing
 * and printing"). Follows this app's one existing "export to PDF" pattern
 * — a print-friendly page under app/(print)/**, opened in a new tab and
 * saved via the browser's native Print / Save-as-PDF (see
 * app/(print)/reports/summary/print and every invoice/quotation/job-order
 * print view) — rather than introducing a PDF-generation dependency for a
 * feature this app has never needed one for. Same permission gate as the
 * interactive Payments page and the CSV/XLSX export action (PAYMENT_VIEW):
 * an export can never surface a payment its viewer couldn't already see in
 * the table.
 */

function resolveCell(key: PaymentExportColumnKey, p: PaymentExportRow): string {
  switch (key) {
    case "orderNumber":
      return p.order.orderNumber;
    case "quoteNumber":
      return p.order.quotation?.quoteNumber ?? "—";
    case "customerName":
      return p.order.customer.name;
    case "customerPhone":
      return p.order.customer.contactNumber ?? "—";
    case "customerEmail":
      return p.order.customer.email ?? "—";
    case "amount":
      return formatCurrency(p.amount.toString());
    case "method":
      return p.method.replace(/_/g, " ");
    case "status":
      return p.status;
    case "paymentDate":
      return formatDate(p.paymentDate) ?? "—";
    case "referenceNumber":
      return p.referenceNumber ?? "—";
    case "recordedBy":
      return p.recordedBy.name;
    case "notes":
      return p.notes ?? "—";
    case "proofLink":
      return p.proofFilePath ?? "—";
  }
}

export default async function PaymentsExportPrintPage({ searchParams }: PageProps<"/payments/export">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "PAYMENT_VIEW"))) redirect("/dashboard");

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const rawStatus = typeof sp.status === "string" ? sp.status : "";
  const status: "PENDING" | "CONFIRMED" | "REJECTED" | undefined =
    rawStatus === "PENDING" || rawStatus === "CONFIRMED" || rawStatus === "REJECTED" ? rawStatus : undefined;
  const period = (typeof sp.period === "string" ? sp.period : "all") as PaymentFilterPeriod;
  const what = (typeof sp.what === "string" ? sp.what : "all") as "all" | "columns" | "summary";
  const includeHeaders = sp.includeHeaders !== "false";
  const includeTotals = sp.includeTotals === "true";
  const includeProofLinks = sp.includeProofLinks === "true";
  const requestedColumns = typeof sp.columns === "string" && sp.columns ? sp.columns.split(",") : [];

  const filters = { q, status, period };

  await logAudit(user.id, "PAYMENTS_EXPORTED", "Payment", "export", { format: "pdf", what, filters: { q, status, period } });

  if (what === "summary") {
    const summary = await getPaymentsExportSummary(filters);
    return (
      <DocumentShell title="Payments Export — Summary" documentNumber={new Date().toLocaleDateString("en-PH")}>
        <DocumentSection title="Overall">
          <p className="text-sm text-slate-700">
            {summary.overall.count} payment(s) totaling {formatCurrency(summary.overall.total)}
          </p>
        </DocumentSection>
        <DocumentSection title="By Status">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-1">Status</th>
                <th className="py-1 text-right">Count</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.byStatus.map((s) => (
                <tr key={s.status} className="border-b border-slate-100">
                  <td className="py-1">{s.status}</td>
                  <td className="py-1 text-right tabular-nums">{s.count}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DocumentSection>
        <DocumentSection title="By Method">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-1">Method</th>
                <th className="py-1 text-right">Count</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.byMethod.map((m) => (
                <tr key={m.method} className="border-b border-slate-100">
                  <td className="py-1">{m.method.replace(/_/g, " ")}</td>
                  <td className="py-1 text-right tabular-nums">{m.count}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DocumentSection>
      </DocumentShell>
    );
  }

  const effectiveColumns = (
    what === "columns" && requestedColumns.length > 0
      ? PAYMENT_EXPORT_COLUMNS.filter((c) => requestedColumns.includes(c.key))
      : PAYMENT_EXPORT_COLUMNS.filter((c) => (DEFAULT_EXPORT_COLUMNS as string[]).includes(c.key))
  ).filter((c) => c.key !== "proofLink" || includeProofLinks);

  const { payments, total, truncated } = await getPaymentsForExport(filters);
  const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const amountColIdx = effectiveColumns.findIndex((c) => c.key === "amount");

  return (
    <>
      {/* This export can have up to a dozen columns — wider than any other
          print document in the app (invoices/quotations/SOA are narrow,
          2-4 column layouts). Scoped to a plain <style> tag rather than
          editing the shared @media print rule in globals.css, since this
          page is always its own standalone document/print job — it can't
          leak this override onto any other print route. */}
      <style>{"@media print { @page { size: A4 landscape; margin: 12mm 10mm; } }"}</style>
      <DocumentShell title="Payments Export" documentNumber={`${payments.length} record(s)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
          {includeHeaders && (
            <thead>
              <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-400">
                {effectiveColumns.map((c) => (
                  <th key={c.key} className="py-1 pr-2">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 break-inside-avoid">
                {effectiveColumns.map((c) => (
                  <td key={c.key} className="py-1 pr-2">
                    {c.key === "proofLink" && p.proofFilePath ? (
                      <a href={p.proofFilePath} className="underline">
                        {p.proofFilePath}
                      </a>
                    ) : (
                      resolveCell(c.key, p)
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={effectiveColumns.length} className="py-3 text-slate-400">
                  No payments match these filters.
                </td>
              </tr>
            )}
          </tbody>
          {includeTotals && amountColIdx >= 0 && payments.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-semibold">
                {effectiveColumns.map((c, i) => (
                  <td key={c.key} className="py-1 pr-2">
                    {i === amountColIdx ? formatCurrency(totalAmount) : i === 0 ? "TOTAL" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
        {truncated && (
          <p className="mt-3 text-xs text-slate-500">
            Showing the first {payments.length} of {total} matching payments — refine the filters for a complete export.
          </p>
        )}
      </DocumentShell>
    </>
  );
}
