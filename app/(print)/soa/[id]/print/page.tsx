import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer } from "@/lib/current-customer";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { computeStatementOfAccount, deriveSoaBalanceStatus } from "@/lib/soa";
import { getBusinessSettings } from "@/lib/business-settings";
import { DocumentShell, DocumentField, DocumentSection } from "@/components/documents/document-shell";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";

export default async function StatementPrintPage({ params }: PageProps<"/soa/[id]/print">) {
  const { id } = await params;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const statement = await prisma.statementOfAccount.findUnique({ where: { id }, include: { customer: true } });
  if (!statement) notFound();

  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (statement.customerId !== customer.id) redirect("/payments");
  } else if (user.role === "STAFF" && !(await can(user, "SOA_VIEW"))) {
    redirect("/dashboard");
  }

  const [computation, openOrders, settings] = await Promise.all([
    computeStatementOfAccount(statement.customerId, statement.periodStart, statement.periodEnd),
    prisma.order.findMany({ where: { customerId: statement.customerId, status: { not: "CANCELLED" } }, select: { dueDate: true } }),
    getBusinessSettings(),
  ]);
  const balanceStatus = deriveSoaBalanceStatus(openOrders);

  return (
    <DocumentShell title="Statement of Account" documentNumber={statement.statementNumber}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <DocumentField label="Statement No." value={statement.statementNumber} />
        <DocumentField label="Statement Date" value={formatDate(statement.generatedAt)} />
        <DocumentField
          label="Statement Period"
          value={`${formatDate(statement.periodStart)} – ${formatDate(new Date(statement.periodEnd.getTime() - 1))}`}
        />
      </div>

      <DocumentSection title="Customer">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <DocumentField label="Customer Name" value={statement.customer.name} />
          <DocumentField label="Customer ID" value={statement.customer.displayId} />
          <DocumentField label="Address" value={statement.customer.address} />
          <DocumentField label="Contact Number" value={statement.customer.contactNumber} />
          <DocumentField label="Email" value={statement.customer.email} />
          {statement.customer.facebookUrl && <DocumentField label="Facebook" value={statement.customer.facebookUrl} />}
        </div>
      </DocumentSection>

      <DocumentSection title="Account Summary">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <DocumentField label="Opening Balance" value={formatCurrency(computation.openingBalance)} />
          <DocumentField label="Charges / New Transactions" value={formatCurrency(computation.totalCharges)} />
          <DocumentField label="Payments / Credits" value={formatCurrency(computation.totalPayments)} />
          <DocumentField label="Adjustments" value={formatCurrency(computation.adjustments)} />
          <DocumentField label="Outstanding Balance" value={formatCurrency(computation.outstandingBalance)} />
          <DocumentField label="Status" value={computation.outstandingBalance > 0.01 ? <DocumentStatusBadge status={balanceStatus} /> : <DocumentStatusBadge status="PAID" />} />
        </div>
      </DocumentSection>

      <DocumentSection title="Transaction Details">
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1.5 pr-2">Date</th>
                <th className="py-1.5 pr-2">Reference</th>
                <th className="py-1.5 pr-2">Description</th>
                <th className="py-1.5 pr-2 text-right">Charge</th>
                <th className="py-1.5 pr-2 text-right">Payment</th>
                <th className="py-1.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {computation.rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="py-1.5 pr-2 font-medium">{r.reference}</td>
                  <td className="py-1.5 pr-2 text-slate-600">{r.description}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.charge > 0 ? formatCurrency(r.charge) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.payment > 0 ? formatCurrency(r.payment) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{formatCurrency(r.runningBalance)}</td>
                </tr>
              ))}
              {computation.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-slate-400">
                    No activity in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DocumentSection>

      <div className="ml-auto w-full max-w-xs break-inside-avoid">
        <div className="flex justify-between border-t-2 border-brand-600 pt-2 text-base font-bold text-brand-700">
          <span>Total Amount Due</span>
          <span className="tabular-nums">{formatCurrency(Math.max(computation.outstandingBalance, 0))}</span>
        </div>
      </div>

      {settings.paymentInstructions && (
        <DocumentSection title="Payment Instructions">
          <p className="text-sm whitespace-pre-wrap text-slate-700">{settings.paymentInstructions}</p>
        </DocumentSection>
      )}

      <p className="text-xs text-slate-400">Generated {formatDateTime(statement.generatedAt)}</p>
    </DocumentShell>
  );
}
