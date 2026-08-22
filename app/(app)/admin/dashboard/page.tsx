import { requireRole } from "@/lib/session";
import { AdminStaffDashboard } from "@/components/dashboard/admin-staff-dashboard";
import type { QuickAction } from "@/components/dashboard/quick-action-menu";

export default async function AdminDashboardPage() {
  const user = await requireRole(["ADMIN"]);

  const quickActions: QuickAction[] = [
    { label: "New Quotation", href: "/quotations/new" },
    { label: "New Order", href: "/orders/new" },
    { label: "Record Payment", href: "/payments" },
  ];

  return <AdminStaffDashboard name={user.name ?? "Admin"} canSeeFinancials canMessageCustomers quickActions={quickActions} />;
}
