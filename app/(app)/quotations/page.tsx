import Link from "next/link";
import { redirect } from "next/navigation";
import { FileStack, CheckCircle2, Send, FileEdit } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ListFilters } from "@/components/lists/list-filters";
import { ListPagination } from "@/components/lists/list-pagination";
import { ListExportDialog } from "@/components/lists/list-export-dialog";
import { getQuotationsSummary, getPaginatedQuotations } from "@/lib/quotations-list";
import { exportQuotationsAction } from "@/app/actions/quotations-export";
import { QUOTATION_EXPORT_COLUMNS, DEFAULT_QUOTATION_EXPORT_COLUMNS } from "@/lib/quotation-export-columns";
import { QuotationsTable, type QuotationRow } from "./quotations-table";
import type { PaymentFilterPeriod } from "@/lib/payment-filter-periods";

const PAGE_SIZE = 15;
const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "REVISION_REQUESTED", label: "Revision Requested" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default async function QuotationsPage({ searchParams }: PageProps<"/quotations">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (user.role === "STAFF" && !(await can(user, "QUOTATION_VIEW"))) redirect("/dashboard");
  const canCreate = user.role === "ADMIN" || (await can(user, "QUOTATION_CREATE"));

  // Customer's own quotation list — unchanged, this redesign is scoped to
  // the staff/admin dashboard only (Aug 22 UI redesign update 2).
  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    const quotations = await prisma.quotation.findMany({
      where: { customerId: customer.id },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Quotations</h1>
            <p className="text-sm text-slate-500">Review pricing before an order is created.</p>
          </div>
        </div>
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH>Total</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {quotations.map((q) => (
                <TR key={q.id}>
                  <TD className="font-medium text-slate-900">{q.quoteNumber}</TD>
                  <TD>{formatCurrency(q.total.toString())}</TD>
                  <TD>
                    <StatusBadge status={q.status} />
                  </TD>
                  <TD>{formatDate(q.createdAt)}</TD>
                  <TD>
                    <Link href={`/quotations/${q.id}`} className="text-sm font-medium text-slate-900 underline">
                      View
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {quotations.length === 0 && <EmptyState label="No quotations yet." />}
        </Card>
      </div>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const q = typeof sp.q === "string" ? sp.q : "";
  const rawStatus = typeof sp.status === "string" ? sp.status : "";
  const validStatuses = ["DRAFT", "SENT", "APPROVED", "REJECTED", "REVISION_REQUESTED", "CANCELLED"] as const;
  const status = (validStatuses as readonly string[]).includes(rawStatus) ? (rawStatus as (typeof validStatuses)[number]) : undefined;
  const period = (typeof sp.period === "string" ? sp.period : "all") as PaymentFilterPeriod;

  const [summary, list] = await Promise.all([
    getQuotationsSummary(),
    getPaginatedQuotations({ page, pageSize: PAGE_SIZE, q: q || undefined, status, period }),
  ]);
  const rows: QuotationRow[] = list.quotations.map((qt) => ({
    id: qt.id,
    quoteNumber: qt.quoteNumber,
    customerName: qt.customer.name,
    total: qt.total.toString(),
    status: qt.status,
    createdAt: qt.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotations</h1>
          <p className="text-sm text-slate-500">Review pricing before an order is created.</p>
        </div>
        {canCreate && (
          <Link href="/quotations/new">
            <Button>+ New Quotation</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Quotations" value={summary.total} sub="This month" icon={FileStack} iconTone="purple" />
        <KpiCard label="Approved" value={summary.approved} sub="This month" icon={CheckCircle2} iconTone="green" />
        <KpiCard label="Sent" value={summary.sent} sub="This month" icon={Send} iconTone="blue" />
        <KpiCard label="Draft / Rejected" value={summary.draftOrRejected} sub="This month" icon={FileEdit} iconTone="orange" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <ListFilters
            basePath="/quotations"
            q={q}
            status={status ?? ""}
            period={period}
            statusOptions={STATUS_OPTIONS}
            searchPlaceholder="Search quotation, customer..."
          />
          <ListExportDialog
            moduleLabel="Quotations"
            q={q}
            status={status ?? ""}
            period={period}
            columns={[...QUOTATION_EXPORT_COLUMNS]}
            defaultColumns={DEFAULT_QUOTATION_EXPORT_COLUMNS}
            hasAmountColumn
            exportAction={exportQuotationsAction}
            pdfPath="/quotations/export"
          />
        </CardContent>
      </Card>

      <Card>
        <QuotationsTable quotations={rows} isStaffLike={isStaffLike} />
        <ListPagination basePath="/quotations" page={list.page} totalPages={list.totalPages} total={list.total} pageSize={list.pageSize} itemLabel="quotations" searchParams={sp} />
      </Card>
    </div>
  );
}
