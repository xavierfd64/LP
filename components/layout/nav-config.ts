import { Permission } from "@/lib/permissions";

export type NavItem = { label: string; href: string };

const STAFF_NAV_RULES: { label: string; href: string; permission?: Permission }[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Inquiries", href: "/inquiries", permission: "INQUIRY_VIEW" },
  { label: "Quotations", href: "/quotations", permission: "QUOTATION_VIEW" },
  { label: "Orders", href: "/orders", permission: "ORDER_VIEW" },
  { label: "Production", href: "/production", permission: "PRODUCTION_VIEW" },
  { label: "Inventory", href: "/inventory" },
  { label: "Payments", href: "/payments", permission: "PAYMENT_VIEW" },
  { label: "Reward Rules", href: "/admin/rewards", permission: "REWARDS_MANAGE_CONFIG" },
];

/**
 * `staffPermissions` is only meaningful (and only passed) for role="STAFF" —
 * it's the set of permissions the Admin has granted that specific account.
 * Every other role's nav is fixed, exactly as before this permission system
 * existed.
 */
export function navForRole(role: string, staffPermissions?: Set<Permission>): NavItem[] {
  switch (role) {
    case "ADMIN":
      return [
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Inquiries", href: "/inquiries" },
        { label: "Quotations", href: "/quotations" },
        { label: "Orders", href: "/orders" },
        { label: "Production", href: "/production" },
        { label: "Inventory", href: "/inventory" },
        { label: "Payments", href: "/payments" },
        { label: "Workflow Templates", href: "/admin/workflow-templates" },
        { label: "Users", href: "/admin/users" },
        { label: "Staff & Permissions", href: "/admin/staff-permissions" },
        { label: "Reward Rules", href: "/admin/rewards" },
        { label: "Audit Log", href: "/admin/audit-log" },
        { label: "Business Settings", href: "/admin/settings" },
      ];
    case "STAFF":
      return STAFF_NAV_RULES.filter((item) => !item.permission || staffPermissions?.has(item.permission)).map(
        ({ label, href }) => ({ label, href })
      );
    case "PRODUCTION":
      return [
        { label: "Production Queue", href: "/production" },
        { label: "Inventory", href: "/inventory" },
      ];
    case "CUSTOMER":
      return [
        { label: "Dashboard", href: "/dashboard" },
        { label: "My Inquiries", href: "/inquiries" },
        { label: "My Quotations", href: "/quotations" },
        { label: "My Orders", href: "/orders" },
        { label: "Payment", href: "/payments" },
        { label: "My Rewards", href: "/account/rewards" },
      ];
    default:
      return [];
  }
}
