import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { can } from "@/lib/permissions-guard";
import { AdminStaffDashboard } from "@/components/dashboard/admin-staff-dashboard";
import { CustomerDashboard } from "@/components/dashboard/customer-dashboard";
import type { QuickAction } from "@/components/dashboard/quick-action-menu";

export default async function DashboardPage() {
  const user = await requireUser();

  if (user.role === "CUSTOMER") {
    const customer = await getCurrentCustomer(user.id);
    return <CustomerDashboard customerId={customer.id} name={user.name ?? "there"} />;
  }

  // Same dashboard Admin sees (spec item 37) — data and quick actions are
  // gated by this Staff account's actual granted permissions, never a
  // second, parallel Staff-specific dashboard implementation.
  const [canSeeFinancials, canMessageCustomers, canCreateQuotation, canSendQuotation, canCreateOrder, canRecordPayment] = await Promise.all([
    can(user, "PAYMENT_VIEW"),
    can(user, "COMMUNICATION_SEARCH_CUSTOMER"),
    can(user, "QUOTATION_CREATE"),
    can(user, "QUOTATION_SEND"),
    can(user, "ORDER_CREATE"),
    can(user, "PAYMENT_RECORD"),
  ]);

  const quickActions: QuickAction[] = [
    ...(canCreateQuotation ? [{ label: "New Quotation", kind: "quotation" as const }] : []),
    ...(canCreateOrder ? [{ label: "New Order", kind: "order" as const }] : []),
    ...(canRecordPayment ? [{ label: "Record Payment", kind: "payment" as const }] : []),
  ];

  return (
    <AdminStaffDashboard
      name={user.name ?? "there"}
      canSeeFinancials={canSeeFinancials}
      canMessageCustomers={canMessageCustomers}
      quickActions={quickActions}
      canSendQuotation={canSendQuotation}
    />
  );
}
