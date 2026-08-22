import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { DocumentShell, DocumentField, DocumentSection } from "@/components/documents/document-shell";
import { DocumentItemsTable } from "@/components/documents/document-items-table";
import { DocumentTotals } from "@/components/documents/document-totals";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";

export default async function QuotationPrintPage({ params }: PageProps<"/quotations/[id]/print">) {
  const { id } = await params;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      customer: { include: { user: true } },
      lineItems: true,
      createdBy: true,
    },
  });
  if (!quotation) notFound();

  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (quotation.customerId !== customer.id) redirect("/quotations");
  } else if (user.role === "STAFF" && !(await can(user, "QUOTATION_VIEW"))) {
    redirect("/dashboard");
  }

  const subtotal = quotation.subtotal != null ? Number(quotation.subtotal) : quotation.lineItems.reduce((sum, li) => sum + li.qty * Number(li.unitPrice), 0);
  const contact =
    quotation.customer.email ?? quotation.customer.contactNumber ?? quotation.customer.user?.email ?? quotation.customer.user?.phone ?? null;

  return (
    <DocumentShell title="Quotation" documentNumber={quotation.quoteNumber}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DocumentField label="Quotation Number" value={quotation.quoteNumber} />
        <DocumentField label="Date Created" value={formatDate(quotation.createdAt)} />
        <DocumentField label="Valid Until" value={quotation.validUntil ? formatDate(quotation.validUntil) : "—"} />
        <DocumentField label="Status" value={<DocumentStatusBadge status={quotation.status} />} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DocumentField label="Customer" value={quotation.customer.name} />
        <DocumentField label="Contact" value={contact} />
        <DocumentField label="Address" value={quotation.customer.address} />
        <DocumentField label="Prepared By" value={quotation.createdBy?.name ?? "—"} />
      </div>

      <DocumentSection title="Items">
        <DocumentItemsTable
          items={quotation.lineItems.map((li) => ({
            label: li.description,
            type: li.productType,
            qty: li.qty,
            unitPrice: Number(li.unitPrice),
          }))}
        />
      </DocumentSection>

      <DocumentTotals
        subtotal={subtotal}
        discount={Number(quotation.discountAmount) > 0 ? Number(quotation.discountAmount) : undefined}
        rows={Number(quotation.taxAmount) > 0 ? [{ label: "Tax / VAT", value: formatCurrency(Number(quotation.taxAmount)) }] : undefined}
        grandTotal={Number(quotation.total)}
      />

      <DocumentSection title="Approval">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Prepared By</p>
            <p className="text-sm font-medium text-slate-900">{quotation.createdBy?.name ?? "—"}</p>
            <p className="text-xs text-slate-400">{formatDateTime(quotation.createdAt)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Customer Approval</p>
            <p className="text-sm font-medium text-slate-900">{quotation.customer.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <DocumentStatusBadge status={quotation.status} />
              <span className="text-xs text-slate-400">as of {formatDateTime(quotation.updatedAt)}</span>
            </div>
          </div>
        </div>
      </DocumentSection>

      {quotation.notes && (
        <DocumentSection title="Notes">
          <p className="text-sm whitespace-pre-wrap text-slate-700">{quotation.notes}</p>
        </DocumentSection>
      )}
    </DocumentShell>
  );
}
