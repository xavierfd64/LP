import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, FolderOpen, Factory, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { TransactionBrandHeader } from "@/components/branding/transaction-brand-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ListFilters } from "@/components/lists/list-filters";
import { ListPagination } from "@/components/lists/list-pagination";
import { ListExportDialog } from "@/components/lists/list-export-dialog";
import { getOrdersSummary, getPaginatedOrders } from "@/lib/orders-list";
import { exportOrdersAction } from "@/app/actions/orders-export";
import { ORDER_EXPORT_COLUMNS, DEFAULT_ORDER_EXPORT_COLUMNS } from "@/lib/order-export-columns";
import { OrdersTable, type OrderRow } from "./orders-table";
import type { PaymentFilterPeriod } from "@/lib/payment-filter-periods";

const PAGE_SIZE = 15;
const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PRODUCTION", label: "In Production" },
  { value: "FULFILLING", label: "Fulfilling" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (user.role === "STAFF" && !(await can(user, "ORDER_VIEW"))) redirect("/dashboard");
  const canCreate = user.role === "ADMIN" || (await can(user, "ORDER_CREATE"));

  const sp = await searchParams;

  // Customer's own "My Orders" / "Invoices" view — unchanged, this
  // redesign is scoped to the staff/admin dashboard only (Aug 22 UI
  // redesign update 2).
  if (!isStaffLike) {
    const isInvoicesView = sp.view === "invoices";
    const customer = await getCurrentCustomer(user.id);
    const orders = await prisma.order.findMany({
      where: { customerId: customer.id },
      include: { customer: true, jobOrders: true },
      orderBy: { createdAt: "desc" },
    });

    return (
      <div className="space-y-6">
        <TransactionBrandHeader />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{isInvoicesView ? "Invoices" : "My Orders"}</h1>
            <p className="text-sm text-slate-500">
              {isInvoicesView ? "Printable invoices for each of your orders." : "Track job orders, payments, and fulfillment."}
            </p>
          </div>
        </div>
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Order #</TH>
                <TH>Job Orders</TH>
                <TH>Total</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {orders.map((o) => (
                <TR key={o.id}>
                  <TD className="font-medium text-slate-900">{o.orderNumber}</TD>
                  <TD>{o.jobOrders.length}</TD>
                  <TD>{formatCurrency(o.totalAmount.toString())}</TD>
                  <TD>
                    <StatusBadge status={o.status} />
                  </TD>
                  <TD>{formatDate(o.createdAt)}</TD>
                  <TD className="flex items-center gap-3">
                    <Link href={`/orders/${o.id}`} className="text-sm font-medium text-slate-900 underline">
                      View
                    </Link>
                    {isInvoicesView && (
                      <Link href={`/orders/${o.id}/invoice`} target="_blank" className="text-sm font-medium text-brand-600 underline">
                        Invoice
                      </Link>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {orders.length === 0 && <EmptyState label={isInvoicesView ? "No invoices yet." : "No orders yet."} />}
        </Card>
      </div>
    );
  }

  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const q = typeof sp.q === "string" ? sp.q : "";
  const rawStatus = typeof sp.status === "string" ? sp.status : "";
  const validStatuses = ["OPEN", "IN_PRODUCTION", "FULFILLING", "COMPLETED", "CANCELLED"] as const;
  const status = (validStatuses as readonly string[]).includes(rawStatus) ? (rawStatus as (typeof validStatuses)[number]) : undefined;
  const period = (typeof sp.period === "string" ? sp.period : "all") as PaymentFilterPeriod;

  const [summary, list] = await Promise.all([
    getOrdersSummary(),
    getPaginatedOrders({ page, pageSize: PAGE_SIZE, q: q || undefined, status, period }),
  ]);
  const rows: OrderRow[] = list.orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customer.name,
    jobOrdersCount: o.jobOrders.length,
    total: o.totalAmount.toString(),
    status: o.status,
    createdAt: o.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <TransactionBrandHeader />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
          <p className="text-sm text-slate-500">Track job orders, payments, and fulfillment.</p>
        </div>
        {canCreate && (
          <Link href="/orders/new">
            <Button>+ New Order</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Orders" value={summary.total} sub="This month" icon={ClipboardList} iconTone="purple" />
        <KpiCard label="Open" value={summary.open} sub="This month" icon={FolderOpen} iconTone="blue" />
        <KpiCard label="In Production" value={summary.inProduction} sub="This month" icon={Factory} iconTone="orange" />
        <KpiCard label="Completed" value={summary.completed} sub="This month" icon={CheckCircle2} iconTone="green" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <ListFilters
            basePath="/orders"
            q={q}
            status={status ?? ""}
            period={period}
            statusOptions={STATUS_OPTIONS}
            searchPlaceholder="Search order, customer, job order..."
          />
          <ListExportDialog
            moduleLabel="Orders"
            q={q}
            status={status ?? ""}
            period={period}
            columns={[...ORDER_EXPORT_COLUMNS]}
            defaultColumns={DEFAULT_ORDER_EXPORT_COLUMNS}
            hasAmountColumn
            exportAction={exportOrdersAction}
            pdfPath="/orders/export"
          />
        </CardContent>
      </Card>

      <Card>
        <OrdersTable orders={rows} isStaffLike={isStaffLike} />
        <ListPagination basePath="/orders" page={list.page} totalPages={list.totalPages} total={list.total} pageSize={list.pageSize} itemLabel="orders" searchParams={sp} />
      </Card>
    </div>
  );
}
