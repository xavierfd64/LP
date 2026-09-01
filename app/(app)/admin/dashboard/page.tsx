import { requireRole } from "@/lib/session";
import { AdminStaffDashboard } from "@/components/dashboard/admin-staff-dashboard";
import type { QuickAction } from "@/components/dashboard/quick-action-menu";

export default async function AdminDashboardPage() {
  const user = await requireRole(["ADMIN"]);

  const quickActions: QuickAction[] = [
    { label: "New Quotation", kind: "quotation" },
    { label: "New Order", kind: "order" },
    { label: "Record Payment", kind: "payment" },
  ];

  return (
    <AdminStaffDashboard
      name={user.name ?? "Admin"}
      canSeeFinancials
      canMessageCustomers
      quickActions={quickActions}
      canSendQuotation
      canRecordPayment
    />
  );
}
