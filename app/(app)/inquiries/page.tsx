import Link from "next/link";
import { redirect } from "next/navigation";
import { Search as SearchIcon, FileCheck2, FileText, Archive } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ListFilters } from "@/components/lists/list-filters";
import { ListPagination } from "@/components/lists/list-pagination";
import { ListExportDialog } from "@/components/lists/list-export-dialog";
import { getInquiriesSummary, getPaginatedInquiries } from "@/lib/inquiries-list";
import { exportInquiriesAction } from "@/app/actions/inquiries-export";
import { INQUIRY_EXPORT_COLUMNS, DEFAULT_INQUIRY_EXPORT_COLUMNS } from "@/lib/inquiry-export-columns";
import { InquiriesTable, type InquiryRow } from "./inquiries-table";
import type { PaymentFilterPeriod } from "@/lib/payment-filter-periods";

const PAGE_SIZE = 15;
const STATUS_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "QUOTED", label: "Quoted" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default async function InquiriesPage({ searchParams }: PageProps<"/inquiries">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (user.role === "STAFF" && !(await can(user, "INQUIRY_VIEW"))) redirect("/dashboard");
  const canHandle = user.role === "ADMIN" || (await can(user, "INQUIRY_HANDLE"));

  // Customer's own inquiry list — unchanged, this redesign is scoped to
  // the staff/admin dashboard only (Aug 22 UI redesign update 2).
  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    const inquiries = await prisma.inquiry.findMany({
      where: { customerId: customer.id },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Inquiries</h1>
            <p className="text-sm text-slate-500">Customer requests before a quotation is prepared.</p>
          </div>
        </div>
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>Qty</TH>
                <TH>Status</TH>
                <TH>Submitted</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {inquiries.map((inq) => (
                <TR key={inq.id}>
                  <TD>{inq.desiredProduct}</TD>
                  <TD>{inq.roughQty ?? "—"}</TD>
                  <TD>
                    <StatusBadge status={inq.status} />
                  </TD>
                  <TD>{formatDate(inq.createdAt)}</TD>
                  <TD>
                    <Link href={`/inquiries/${inq.id}`} className="text-sm font-medium text-slate-900 underline">
                      View
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {inquiries.length === 0 && <EmptyState label="No inquiries yet." />}
        </Card>
      </div>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const q = typeof sp.q === "string" ? sp.q : "";
  const rawStatus = typeof sp.status === "string" ? sp.status : "";
  const status = rawStatus === "NEW" || rawStatus === "QUOTED" || rawStatus === "CLOSED" || rawStatus === "CANCELLED" ? rawStatus : undefined;
  const period = (typeof sp.period === "string" ? sp.period : "all") as PaymentFilterPeriod;

  const [summary, list] = await Promise.all([
    getInquiriesSummary(),
    getPaginatedInquiries({ page, pageSize: PAGE_SIZE, q: q || undefined, status, period }),
  ]);
  const rows: InquiryRow[] = list.inquiries.map((inq) => ({
    id: inq.id,
    customerName: inq.customer.name,
    product: inq.desiredProduct,
    qty: inq.roughQty,
    status: inq.status,
    createdAt: inq.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inquiries</h1>
          <p className="text-sm text-slate-500">Customer requests before a quotation is prepared.</p>
        </div>
        {canHandle && (
          <Link href="/inquiries/new">
            <Button>+ New Inquiry</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Inquiries" value={summary.total} sub="This month" icon={SearchIcon} iconTone="purple" />
        <KpiCard label="Quoted" value={summary.quoted} sub="This month" icon={FileCheck2} iconTone="purple" />
        <KpiCard label="New" value={summary.new} sub="This month" icon={FileText} iconTone="blue" />
        <KpiCard label="Closed" value={summary.closed} sub="This month" icon={Archive} iconTone="green" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <ListFilters basePath="/inquiries" q={q} status={status ?? ""} period={period} statusOptions={STATUS_OPTIONS} searchPlaceholder="Search customer, product..." />
          <ListExportDialog
            moduleLabel="Inquiries"
            q={q}
            status={status ?? ""}
            period={period}
            columns={[...INQUIRY_EXPORT_COLUMNS]}
            defaultColumns={DEFAULT_INQUIRY_EXPORT_COLUMNS}
            hasAmountColumn={false}
            exportAction={exportInquiriesAction}
            pdfPath="/inquiries/export"
          />
        </CardContent>
      </Card>

      <Card>
        <InquiriesTable inquiries={rows} isStaffLike={isStaffLike} />
        <ListPagination basePath="/inquiries" page={list.page} totalPages={list.totalPages} total={list.total} pageSize={list.pageSize} itemLabel="inquiries" searchParams={sp} />
      </Card>
    </div>
  );
}
