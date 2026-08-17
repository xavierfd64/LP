import { formatCurrency, formatDate } from "@/lib/utils";
import { resolvePublicDocument } from "@/lib/public-document";
import { DocumentShell, DocumentField, DocumentSection } from "@/components/documents/document-shell";
import { DocumentItemsTable, type DocumentLineItem } from "@/components/documents/document-items-table";
import { DocumentTotals } from "@/components/documents/document-totals";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { DownloadPdfButton } from "./download-pdf-button";

export default async function SharedDocumentPage({ params }: PageProps<"/documents/[token]">) {
  const { token } = await params;
  const result = await resolvePublicDocument(token);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
          <p className="font-medium text-slate-900">This document link is no longer available.</p>
          <p className="mt-1 text-sm text-slate-500">Please contact us for assistance.</p>
        </div>
      </div>
    );
  }

  const isViewOnly = result.accessLevel === "VIEW_ONLY";
  const headerAction = isViewOnly ? null : <DownloadPdfButton token={token} />;

  return (
    <div className="py-4">
      <div className={isViewOnly ? "print:hidden" : undefined}>
        {result.docType === "QUOTATION" && result.quotation && (
          <QuotationBody quotation={result.quotation} headerAction={headerAction} />
        )}
        {result.docType === "INVOICE" && result.invoice && (
          <InvoiceBody invoice={result.invoice} headerAction={headerAction} />
        )}
        {result.docType === "JOB_ORDER" && result.jobOrder && (
          <JobOrderBody jobOrder={result.jobOrder} headerAction={headerAction} />
        )}
        {result.docType === "SOA" && result.statement && (
          <StatementBody statement={result.statement} headerAction={headerAction} />
        )}
      </div>
      {isViewOnly && (
        <div className="hidden print:flex print:h-screen print:items-center print:justify-center">
          <p className="text-center text-sm">
            This document is view-only and cannot be printed or downloaded. Please contact us for a copy.
          </p>
        </div>
      )}
    </div>
  );
}

function QuotationBody({
  quotation,
  headerAction,
}: {
  quotation: NonNullable<Extract<Awaited<ReturnType<typeof resolvePublicDocument>>, { ok: true }>["quotation"]>;
  headerAction: React.ReactNode;
}) {
  const subtotal = quotation.lineItems.reduce((sum, li) => sum + li.qty * Number(li.unitPrice), 0);
  return (
    <DocumentShell title="Quotation" documentNumber={quotation.quoteNumber} headerAction={headerAction}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DocumentField label="Quotation Number" value={quotation.quoteNumber} />
        <DocumentField label="Date Created" value={formatDate(quotation.createdAt)} />
        <DocumentField label="Valid Until" value={quotation.validUntil ? formatDate(quotation.validUntil) : "—"} />
        <DocumentField label="Status" value={<DocumentStatusBadge status={quotation.status} />} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DocumentField label="Customer" value={quotation.customer.name} />
        <DocumentField label="Contact" value={quotation.customer.email ?? quotation.customer.contactNumber} />
        <DocumentField label="Address" value={quotation.customer.address} />
        <DocumentField label="Prepared By" value={quotation.createdBy?.name ?? "—"} />
      </div>
      <DocumentSection title="Items">
        <DocumentItemsTable
          items={quotation.lineItems.map((li) => ({ label: li.description, type: li.productType, qty: li.qty, unitPrice: Number(li.unitPrice) }))}
        />
      </DocumentSection>
      <DocumentTotals subtotal={subtotal} grandTotal={Number(quotation.total)} />
      {quotation.notes && (
        <DocumentSection title="Notes">
          <p className="text-sm whitespace-pre-wrap text-slate-700">{quotation.notes}</p>
        </DocumentSection>
      )}
    </DocumentShell>
  );
}

function InvoiceBody({
  invoice,
  headerAction,
}: {
  invoice: NonNullable<Extract<Awaited<ReturnType<typeof resolvePublicDocument>>, { ok: true }>["invoice"]>;
  headerAction: React.ReactNode;
}) {
  const total = Number(invoice.totalAmount);
  const amountPaid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const outstanding = Math.max(total - amountPaid, 0);
  const paymentStatus = amountPaid <= 0 ? "UNPAID" : amountPaid >= total ? "PAID" : "PARTIALLY_PAID";

  let items: DocumentLineItem[];
  if (invoice.quotation && invoice.quotation.lineItems.length > 0) {
    items = invoice.quotation.lineItems.map((li) => ({ label: li.description, type: li.productType, qty: li.qty, unitPrice: Number(li.unitPrice) }));
  } else {
    items = [{ label: `Order ${invoice.orderNumber}`, qty: 1, unitPrice: total }];
  }
  const subtotal = items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);

  return (
    <DocumentShell title="Invoice" documentNumber={invoice.orderNumber} headerAction={headerAction}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DocumentField label="Invoice Number" value={invoice.orderNumber} />
        <DocumentField label="Invoice Date" value={formatDate(invoice.createdAt)} />
        <DocumentField label="Payment Status" value={<DocumentStatusBadge status={paymentStatus} />} />
        <DocumentField label="Order Status" value={<DocumentStatusBadge status={invoice.status} />} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DocumentField label="Customer" value={invoice.customer.name} />
        <DocumentField label="Contact" value={invoice.customer.email ?? invoice.customer.contactNumber} />
        <DocumentField label="Address" value={invoice.customer.address} />
        <DocumentField label="Related Order" value={invoice.orderNumber} />
      </div>
      <DocumentSection title="Items">
        <DocumentItemsTable items={items} />
      </DocumentSection>
      <DocumentTotals
        subtotal={subtotal}
        grandTotal={total}
        grandTotalLabel="Total Amount"
        rows={[
          { label: "Amount Paid", value: formatCurrency(amountPaid) },
          { label: "Outstanding Balance", value: formatCurrency(outstanding), emphasize: outstanding > 0 },
        ]}
      />
    </DocumentShell>
  );
}

function JobOrderBody({
  jobOrder,
  headerAction,
}: {
  jobOrder: NonNullable<Extract<Awaited<ReturnType<typeof resolvePublicDocument>>, { ok: true }>["jobOrder"]>;
  headerAction: React.ReactNode;
}) {
  const currentStage = jobOrder.stageLogs.find((s) => s.stageOrder === jobOrder.currentStageOrder);
  return (
    <DocumentShell title="Job Order" documentNumber={jobOrder.joNumber} headerAction={headerAction}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DocumentField label="Job Order Number" value={jobOrder.joNumber} />
        <DocumentField label="Date Created" value={formatDate(jobOrder.createdAt)} />
        <DocumentField label="Due Date" value={jobOrder.deadline ? formatDate(jobOrder.deadline) : null} />
        <DocumentField label="Status" value={<DocumentStatusBadge status={jobOrder.status} />} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DocumentField label="Customer" value={jobOrder.order.customer.name} />
        <DocumentField label="Contact" value={jobOrder.order.customer.email ?? jobOrder.order.customer.contactNumber} />
        <DocumentField label="Address" value={jobOrder.order.customer.address} />
        <DocumentField label="Related Order" value={jobOrder.order.orderNumber} />
      </div>
      <DocumentSection title="Item / Service">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-900">{jobOrder.productType}</p>
          <p className="text-sm text-slate-600">Quantity: {jobOrder.quantity}</p>
        </div>
      </DocumentSection>
      <DocumentSection title="Current Stage">
        <p className="text-sm text-slate-700">{currentStage?.stageName ?? "—"}</p>
      </DocumentSection>
    </DocumentShell>
  );
}

function StatementBody({
  statement,
  headerAction,
}: {
  statement: NonNullable<Extract<Awaited<ReturnType<typeof resolvePublicDocument>>, { ok: true }>["statement"]>;
  headerAction: React.ReactNode;
}) {
  const { statement: s, computation, balanceStatus } = statement;
  return (
    <DocumentShell title="Statement of Account" documentNumber={s.statementNumber} headerAction={headerAction}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <DocumentField label="Statement No." value={s.statementNumber} />
        <DocumentField label="Statement Date" value={formatDate(s.generatedAt)} />
        <DocumentField
          label="Statement Period"
          value={`${formatDate(s.periodStart)} – ${formatDate(new Date(s.periodEnd.getTime() - 1))}`}
        />
      </div>
      <DocumentSection title="Customer">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <DocumentField label="Customer Name" value={s.customer.name} />
          <DocumentField label="Customer ID" value={s.customer.displayId} />
          <DocumentField label="Address" value={s.customer.address} />
          <DocumentField label="Contact Number" value={s.customer.contactNumber} />
        </div>
      </DocumentSection>
      <DocumentSection title="Account Summary">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <DocumentField label="Opening Balance" value={formatCurrency(computation.openingBalance)} />
          <DocumentField label="Charges" value={formatCurrency(computation.totalCharges)} />
          <DocumentField label="Payments / Credits" value={formatCurrency(computation.totalPayments)} />
          <DocumentField label="Adjustments" value={formatCurrency(computation.adjustments)} />
          <DocumentField
            label="Status"
            value={computation.outstandingBalance > 0.01 ? <DocumentStatusBadge status={balanceStatus} /> : <DocumentStatusBadge status="PAID" />}
          />
        </div>
      </DocumentSection>
      <DocumentSection title="Transaction Details">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-1">Date</th>
              <th className="py-1">Reference</th>
              <th className="py-1">Description</th>
              <th className="py-1 text-right">Charge</th>
              <th className="py-1 text-right">Payment</th>
              <th className="py-1 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {computation.rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1 whitespace-nowrap">{formatDate(r.date)}</td>
                <td className="py-1 font-medium">{r.reference}</td>
                <td className="py-1 text-slate-600">{r.description}</td>
                <td className="py-1 text-right tabular-nums">{r.charge > 0 ? formatCurrency(r.charge) : "—"}</td>
                <td className="py-1 text-right tabular-nums">{r.payment > 0 ? formatCurrency(r.payment) : "—"}</td>
                <td className="py-1 text-right tabular-nums font-medium">{formatCurrency(r.runningBalance)}</td>
              </tr>
            ))}
            {computation.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-2 text-slate-400">
                  No activity in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DocumentSection>
      <div className="ml-auto w-full max-w-xs break-inside-avoid">
        <div className="flex justify-between border-t-2 border-brand-600 pt-2 text-base font-bold text-brand-700">
          <span>Total Amount Due</span>
          <span className="tabular-nums">{formatCurrency(Math.max(computation.outstandingBalance, 0))}</span>
        </div>
      </div>
    </DocumentShell>
  );
}
