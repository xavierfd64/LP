import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Alert } from "@/components/ui/alert";
import { EditorShell, EditorHeader } from "@/components/documents/editor-shell";
import { TransactionBrandHeader } from "@/components/branding/transaction-brand-header";
import { CustomerPaymentForm, type PayableOrder } from "./customer-payment-form";

/**
 * The dedicated customer Payment page (spec Aug 19 corrective update, item
 * 9 — "currently missing"). Before this, a customer's only way to submit
 * a payment was the small inline form buried on a specific Order's detail
 * page; this surfaces the same real action (uploadPaymentProofAction,
 * unchanged business logic) as its own professional workspace with an
 * order/invoice picker, a live balance summary, and payment history —
 * spec item 10: no fake payment gateway, still proof/reference submission
 * through the existing PENDING -> Staff-verified workflow.
 */
export default async function CustomerPaymentPage({ searchParams }: PageProps<"/payments/pay">) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") redirect("/payments");

  const sp = await searchParams;
  const preselectedOrderId = typeof sp.orderId === "string" ? sp.orderId : undefined;
  const justSubmitted = sp.success === "1";

  const customer = await getCurrentCustomer(user.id);
  const orders = await prisma.order.findMany({
    where: { customerId: customer.id },
    include: { payments: { orderBy: { paymentDate: "desc" } } },
    orderBy: { createdAt: "desc" },
  });

  const payable: PayableOrder[] = orders.map((o) => {
    const confirmed = o.payments.filter((p) => p.status === "CONFIRMED").reduce((sum, p) => sum + Number(p.amount), 0);
    const total = Number(o.totalAmount);
    return { id: o.id, orderNumber: o.orderNumber, total, paid: confirmed, balance: Math.max(total - confirmed, 0) };
  });

  const recentPayments = orders
    .flatMap((o) => o.payments.map((p) => ({ ...p, orderNumber: o.orderNumber })))
    .sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime())
    .slice(0, 10);

  return (
    <EditorShell>
      <TransactionBrandHeader />
      <EditorHeader eyebrow="Payment" title="Make a Payment" subtitle={`${customer.name} · ${customer.email ?? ""}`} />

      {justSubmitted && <Alert tone="success">Payment submitted — our team will verify it shortly.</Alert>}

      <CustomerPaymentForm
        orders={payable}
        defaultOrderId={preselectedOrderId}
        recentPayments={recentPayments.map((p) => ({
          id: p.id,
          orderNumber: p.orderNumber,
          amount: Number(p.amount),
          method: p.method,
          referenceNumber: p.referenceNumber,
          status: p.status,
          paymentDate: p.paymentDate.toISOString(),
        }))}
      />
    </EditorShell>
  );
}
