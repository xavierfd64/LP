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
  const [canSeeFinancials, canMessageCustomers, canCreateInquiry, canCreateQuotation, canCreateOrder, canRecordPayment] = await Promise.all([
    can(user, "PAYMENT_VIEW"),
    can(user, "COMMUNICATION_SEARCH_CUSTOMER"),
    can(user, "INQUIRY_HANDLE"),
    can(user, "QUOTATION_CREATE"),
    can(user, "ORDER_CREATE"),
    can(user, "PAYMENT_RECORD"),
  ]);

  const quickActions: QuickAction[] = [
    ...(canCreateInquiry ? [{ label: "New Inquiry", href: "/inquiries/new" }] : []),
    ...(canCreateQuotation ? [{ label: "New Quotation", href: "/quotations/new" }] : []),
    ...(canCreateOrder ? [{ label: "New Order", href: "/orders/new" }] : []),
    ...(canRecordPayment ? [{ label: "Record Payment", href: "/payments" }] : []),
  ];

  return (
    <AdminStaffDashboard
      name={user.name ?? "there"}
      canSeeFinancials={canSeeFinancials}
      canMessageCustomers={canMessageCustomers}
      quickActions={quickActions}
    />
  );
}
