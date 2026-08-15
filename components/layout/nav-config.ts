export type NavItem = { label: string; href: string };

export function navForRole(role: string): NavItem[] {
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
        { label: "Messages", href: "/messages" },
        { label: "Workflow Templates", href: "/admin/workflow-templates" },
        { label: "Users", href: "/admin/users" },
        { label: "Reward Rules", href: "/admin/rewards" },
        { label: "Audit Log", href: "/admin/audit-log" },
      ];
    case "STAFF":
      return [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Inquiries", href: "/inquiries" },
        { label: "Quotations", href: "/quotations" },
        { label: "Orders", href: "/orders" },
        { label: "Inventory", href: "/inventory" },
        { label: "Payments", href: "/payments" },
        { label: "Messages", href: "/messages" },
      ];
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
        { label: "My Rewards", href: "/account/rewards" },
        { label: "Messages", href: "/messages" },
      ];
    default:
      return [];
  }
}
