import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { confirmedPaymentTotal } from "@/lib/workflow";
import { DocumentShell, DocumentField, DocumentSection } from "@/components/documents/document-shell";
import { DocumentItemsTable, type DocumentLineItem } from "@/components/documents/document-items-table";
import { DocumentTotals } from "@/components/documents/document-totals";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";

export default async function InvoicePrintPage({ params }: PageProps<"/orders/[id]/invoice">) {
  const { id } = await params;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { include: { user: true } },
      quotation: { include: { lineItems: true } },
      jobOrders: true,
    },
  });
  if (!order) notFound();

  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (order.customerId !== customer.id) redirect("/orders");
  } else if (user.role === "STAFF" && !(await can(user, "ORDER_VIEW"))) {
    redirect("/dashboard");
  }

  const total = Number(order.totalAmount);
  const amountPaid = await confirmedPaymentTotal(order.id);
  const outstanding = Math.max(total - amountPaid, 0);
  const paymentStatus = amountPaid <= 0 ? "UNPAID" : amountPaid >= total ? "PAID" : "PARTIALLY_PAID";

  // An Order's line-item detail lives on its linked Quotation, if any — a
  // walk-in order can be created without one, so fall back to a single
  // summary line derived from the order's own total (the only figure that's
  // always known) rather than leaving the items table empty.
  let items: DocumentLineItem[];
  if (order.quotation && order.quotation.lineItems.length > 0) {
    items = order.quotation.lineItems.map((li) => ({
      label: li.description,
      type: li.productType,
      qty: li.qty,
      unitPrice: Number(li.unitPrice),
    }));
  } else {
    items = [{ label: `Order ${order.orderNumber}`, type: order.jobOrders[0]?.productType, qty: 1, unitPrice: total }];
  }
  // Pricing breakdown (Sept 3 correction) — an Order created before this
  // fix, or one with no discount/tax at all, has subtotal == null; falling
  // back to the line-item sum (or the bare total, matching the fallback
  // items array above) keeps this page working exactly as before for
  // those. Orders that DO have a recorded breakdown now show it correctly
  // instead of a subtotal that silently didn't reconcile with the grand
  // total whenever a discount or tax had actually been applied.
  const subtotal = order.subtotal != null ? Number(order.subtotal) : items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const discountAmount = Number(order.discountAmount);
  const taxAmount = Number(order.taxAmount);

  const contact = order.customer.email ?? order.customer.contactNumber ?? order.customer.user?.email ?? order.customer.user?.phone ?? null;
  // Unified document identity — this app has no separate persisted
  // Invoice entity, so the invoice "number" is simply the Order's own
  // unified reference number (no prefix, so no derivation needed —
  // Quotation/Job Order/Invoice all show the exact same literal string).
  const invoiceNumber = order.orderNumber;

  return (
    <DocumentShell title="Invoice" documentNumber={invoiceNumber} qrPath={`/orders/${order.id}`}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DocumentField label="Invoice Number" value={invoiceNumber} />
        <DocumentField label="Invoice Date" value={formatDate(order.orderDate)} />
        <DocumentField label="Due Date" value={null} />
        <DocumentField label="Payment Status" value={<DocumentStatusBadge status={paymentStatus} />} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DocumentField label="Customer" value={order.customer.name} />
        <DocumentField label="Contact" value={contact} />
        <DocumentField label="Address" value={order.customer.address} />
        <DocumentField label="Related Order" value={order.orderNumber} />
      </div>

      <DocumentSection title="Items">
        <DocumentItemsTable items={items} />
      </DocumentSection>

      <DocumentTotals
        subtotal={subtotal}
        discount={discountAmount > 0 ? discountAmount : undefined}
        discountLabel={order.discountLabel}
        grandTotal={total}
        grandTotalLabel="Total Amount"
        rows={[
          ...(taxAmount > 0 ? [{ label: `Tax / VAT (${Number(order.taxPct)}%)`, value: formatCurrency(taxAmount) }] : []),
          { label: "Amount Paid", value: formatCurrency(amountPaid) },
          { label: "Outstanding Balance", value: formatCurrency(outstanding), emphasize: outstanding > 0 },
        ]}
      />
    </DocumentShell>
  );
}
