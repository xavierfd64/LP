import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DocumentShell } from "@/components/documents/document-shell";
import { getQuotationsForExport, type QuotationExportRow } from "@/lib/quotations-list";
import { QUOTATION_EXPORT_COLUMNS, DEFAULT_QUOTATION_EXPORT_COLUMNS, type QuotationExportColumnKey } from "@/lib/quotation-export-columns";
import type { PaymentFilterPeriod } from "@/lib/payment-filter-periods";

/** PDF export for the Quotations dashboard — same print-route pattern as app/(print)/payments/export. */

function resolveCell(key: QuotationExportColumnKey, r: QuotationExportRow): string {
  switch (key) {
    case "quoteNumber":
      return r.quoteNumber;
    case "customerName":
      return r.customer.name;
    case "customerPhone":
      return r.customer.contactNumber ?? "—";
    case "customerEmail":
      return r.customer.email ?? "—";
    case "total":
      return formatCurrency(r.total.toString());
    case "status":
      return r.status;
    case "createdAt":
      return formatDate(r.createdAt) ?? "—";
  }
}

export default async function QuotationsExportPrintPage({ searchParams }: PageProps<"/quotations/export">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "QUOTATION_VIEW"))) redirect("/dashboard");

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const rawStatus = typeof sp.status === "string" ? sp.status : "";
  const validStatuses = ["DRAFT", "SENT", "APPROVED", "REJECTED", "REVISION_REQUESTED", "CANCELLED"] as const;
  const status = (validStatuses as readonly string[]).includes(rawStatus) ? (rawStatus as (typeof validStatuses)[number]) : undefined;
  const period = (typeof sp.period === "string" ? sp.period : "all") as PaymentFilterPeriod;
  const what = typeof sp.what === "string" ? sp.what : "all";
  const includeHeaders = sp.includeHeaders !== "false";
  const includeTotals = sp.includeTotals === "true";
  const requestedColumns = typeof sp.columns === "string" && sp.columns ? sp.columns.split(",") : [];

  const filters = { q, status, period };
  await logAudit(user.id, "QUOTATIONS_EXPORTED", "Quotation", "export", { format: "pdf", what, filters });

  if (what === "summary") {
    const { quotations } = await getQuotationsForExport(filters);
    const counts = new Map<string, { count: number; total: number }>();
    for (const r of quotations) {
      const entry = counts.get(r.status) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += Number(r.total);
      counts.set(r.status, entry);
    }
    return (
      <DocumentShell title="Quotations Export — Summary" documentNumber={new Date().toLocaleDateString("en-PH")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-1">Status</th>
              <th className="py-1 text-right">Count</th>
              <th className="py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(counts.entries()).map(([status, v]) => (
              <tr key={status} className="border-b border-slate-100">
                <td className="py-1">{status}</td>
                <td className="py-1 text-right tabular-nums">{v.count}</td>
                <td className="py-1 text-right tabular-nums">{formatCurrency(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DocumentShell>
    );
  }

  const effectiveColumns =
    requestedColumns.length > 0
      ? QUOTATION_EXPORT_COLUMNS.filter((c) => requestedColumns.includes(c.key))
      : QUOTATION_EXPORT_COLUMNS.filter((c) => (DEFAULT_QUOTATION_EXPORT_COLUMNS as string[]).includes(c.key));

  const { quotations, total, truncated } = await getQuotationsForExport(filters);
  const totalAmount = quotations.reduce((sum, r) => sum + Number(r.total), 0);
  const amountColIdx = effectiveColumns.findIndex((c) => c.key === "total");

  return (
    <DocumentShell title="Quotations Export" documentNumber={`${quotations.length} record(s)`}>
      <style>{"@media print { @page { size: A4 landscape; margin: 12mm 10mm; } }"}</style>
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
            {quotations.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 break-inside-avoid">
                {effectiveColumns.map((c) => (
                  <td key={c.key} className="py-1 pr-2">
                    {resolveCell(c.key, r)}
                  </td>
                ))}
              </tr>
            ))}
            {quotations.length === 0 && (
              <tr>
                <td colSpan={effectiveColumns.length} className="py-3 text-slate-400">
                  No quotations match these filters.
                </td>
              </tr>
            )}
          </tbody>
          {includeTotals && amountColIdx >= 0 && quotations.length > 0 && (
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
          Showing the first {quotations.length} of {total} matching quotations — refine the filters for a complete export.
        </p>
      )}
    </DocumentShell>
  );
}
