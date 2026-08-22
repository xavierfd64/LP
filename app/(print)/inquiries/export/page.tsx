import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/utils";
import { DocumentShell } from "@/components/documents/document-shell";
import { getInquiriesForExport, type InquiryExportRow } from "@/lib/inquiries-list";
import { INQUIRY_EXPORT_COLUMNS, DEFAULT_INQUIRY_EXPORT_COLUMNS, type InquiryExportColumnKey } from "@/lib/inquiry-export-columns";
import type { PaymentFilterPeriod } from "@/lib/payment-filter-periods";

/** PDF export for the Inquiries dashboard — same print-route pattern as app/(print)/payments/export (browser Print/Save-as-PDF, no PDF library). */

function resolveCell(key: InquiryExportColumnKey, r: InquiryExportRow): string {
  switch (key) {
    case "customerName":
      return r.customer.name;
    case "customerPhone":
      return r.customer.contactNumber ?? "—";
    case "customerEmail":
      return r.customer.email ?? "—";
    case "product":
      return r.desiredProduct;
    case "quantity":
      return r.roughQty != null ? String(r.roughQty) : "—";
    case "status":
      return r.status;
    case "submittedAt":
      return formatDate(r.createdAt) ?? "—";
  }
}

export default async function InquiriesExportPrintPage({ searchParams }: PageProps<"/inquiries/export">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "INQUIRY_VIEW"))) redirect("/dashboard");

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const rawStatus = typeof sp.status === "string" ? sp.status : "";
  const status: "NEW" | "QUOTED" | "CLOSED" | "CANCELLED" | undefined =
    rawStatus === "NEW" || rawStatus === "QUOTED" || rawStatus === "CLOSED" || rawStatus === "CANCELLED" ? rawStatus : undefined;
  const period = (typeof sp.period === "string" ? sp.period : "all") as PaymentFilterPeriod;
  const what = typeof sp.what === "string" ? sp.what : "all";
  const includeHeaders = sp.includeHeaders !== "false";
  const requestedColumns = typeof sp.columns === "string" && sp.columns ? sp.columns.split(",") : [];

  const filters = { q, status, period };
  await logAudit(user.id, "INQUIRIES_EXPORTED", "Inquiry", "export", { format: "pdf", what, filters });

  if (what === "summary") {
    const { inquiries } = await getInquiriesForExport(filters);
    const counts = new Map<string, number>();
    for (const i of inquiries) counts.set(i.status, (counts.get(i.status) ?? 0) + 1);
    return (
      <DocumentShell title="Inquiries Export — Summary" documentNumber={new Date().toLocaleDateString("en-PH")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-1">Status</th>
              <th className="py-1 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(counts.entries()).map(([status, count]) => (
              <tr key={status} className="border-b border-slate-100">
                <td className="py-1">{status}</td>
                <td className="py-1 text-right tabular-nums">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DocumentShell>
    );
  }

  const effectiveColumns =
    requestedColumns.length > 0
      ? INQUIRY_EXPORT_COLUMNS.filter((c) => requestedColumns.includes(c.key))
      : INQUIRY_EXPORT_COLUMNS.filter((c) => (DEFAULT_INQUIRY_EXPORT_COLUMNS as string[]).includes(c.key));

  const { inquiries, total, truncated } = await getInquiriesForExport(filters);

  return (
    <DocumentShell title="Inquiries Export" documentNumber={`${inquiries.length} record(s)`}>
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
            {inquiries.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 break-inside-avoid">
                {effectiveColumns.map((c) => (
                  <td key={c.key} className="py-1 pr-2">
                    {resolveCell(c.key, r)}
                  </td>
                ))}
              </tr>
            ))}
            {inquiries.length === 0 && (
              <tr>
                <td colSpan={effectiveColumns.length} className="py-3 text-slate-400">
                  No inquiries match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {truncated && (
        <p className="mt-3 text-xs text-slate-500">
          Showing the first {inquiries.length} of {total} matching inquiries — refine the filters for a complete export.
        </p>
      )}
    </DocumentShell>
  );
}
