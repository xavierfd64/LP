import { Permission } from "@/lib/permissions";

export type NavItem = { label: string; href: string; iconKey?: string };
export type NavSection = { section: string; items: NavItem[] };

/**
 * Icon KEYS only here — not the actual Lucide component. Server Components
 * (this file is imported by the async Shell component) can't pass function
 * values as props into "use client" components (SidebarNav/MobileNav), so
 * the string key crosses that boundary instead and the client-side
 * ICON_COMPONENTS map in sidebar-nav.tsx resolves it to the real icon.
 */
const ICON_KEYS: Record<string, string> = {
  "/admin/dashboard": "dashboard",
  "/dashboard": "dashboard",
  "/inquiries": "inbox",
  "/quotations": "fileText",
  "/orders": "package",
  "/production": "factory",
  "/inventory": "boxes",
  "/admin/services": "wrench",
  "/admin/promotions": "percent",
  "/admin/workflow-templates": "gitBranch",
  "/payments": "wallet",
  "/soa": "receipt",
  "/reports/summary": "barChart",
  "/customers": "users",
  "/admin/users": "userCog",
  "/admin/staff-permissions": "shieldCheck",
  "/admin/rewards": "gift",
  "/admin/audit-log": "scrollText",
  "/admin/settings": "settings",
  "/admin/email-settings": "mail",
  "/admin/email-log": "mailCheck",
  "/admin/messenger-settings": "messageSquare",
  "/admin/messenger-log": "messagesSquare",
  "/admin/auth-settings": "keyRound",
  "/admin/themes": "palette",
  "/admin/plugins": "puzzle",
  "/admin/system-updates": "refreshCw",
  "/account/rewards": "gift",
  "/account/profile": "userCircle",
};

function withIcons(items: { label: string; href: string }[]): NavItem[] {
  return items.map((i) => ({ ...i, iconKey: ICON_KEYS[i.href] }));
}

const STAFF_NAV_RULES: { section: string; label: string; href: string; permission?: Permission }[] = [
  { section: "MAIN", label: "Dashboard", href: "/dashboard" },
  { section: "MAIN", label: "Inquiries", href: "/inquiries", permission: "INQUIRY_VIEW" },
  { section: "MAIN", label: "Quotations", href: "/quotations", permission: "QUOTATION_VIEW" },
  { section: "MAIN", label: "Orders", href: "/orders", permission: "ORDER_VIEW" },
  { section: "OPERATIONS", label: "Production", href: "/production", permission: "PRODUCTION_VIEW" },
  { section: "OPERATIONS", label: "Inventory", href: "/inventory" },
  { section: "OPERATIONS", label: "Services", href: "/admin/services", permission: "SERVICE_VIEW" },
  { section: "OPERATIONS", label: "Promotions", href: "/admin/promotions", permission: "SERVICE_MANAGE" },
  { section: "FINANCE", label: "Payments", href: "/payments", permission: "PAYMENT_VIEW" },
  { section: "FINANCE", label: "Statement of Account", href: "/soa", permission: "SOA_VIEW" },
  { section: "CUSTOMERS", label: "Customers", href: "/customers", permission: "CUSTOMER_VIEW" },
  { section: "MANAGEMENT", label: "Reward Rules", href: "/admin/rewards", permission: "REWARDS_MANAGE_CONFIG" },
  { section: "MANAGEMENT", label: "Transaction Summary", href: "/reports/summary", permission: "REPORTS_VIEW" },
  { section: "SYSTEM", label: "Email Log", href: "/admin/email-log", permission: "EMAIL_LOG_VIEW" },
  { section: "SYSTEM", label: "Messenger Log", href: "/admin/messenger-log", permission: "EMAIL_LOG_VIEW" },
];

/**
 * `staffPermissions` is only meaningful (and only passed) for role="STAFF" —
 * it's the set of permissions the Admin has granted that specific account.
 * Every other role's nav is fixed, exactly as before this permission system
 * existed. Grouped into sections per spec item 6 — "Chat" is deliberately
 * not a nav item anywhere (spec item 33): the header's Chat icon opens the
 * existing floating Chatbox instead of a standalone Messages page.
 */
export function navForRole(role: string, staffPermissions?: Set<Permission>): NavSection[] {
  switch (role) {
    case "ADMIN":
      return [
        { section: "MAIN", items: withIcons([
          { label: "Dashboard", href: "/admin/dashboard" },
          { label: "Inquiries", href: "/inquiries" },
          { label: "Quotations", href: "/quotations" },
          { label: "Orders", href: "/orders" },
        ]) },
        { section: "OPERATIONS", items: withIcons([
          { label: "Production", href: "/production" },
          { label: "Inventory", href: "/inventory" },
          { label: "Services", href: "/admin/services" },
          { label: "Promotions", href: "/admin/promotions" },
          { label: "Workflow Templates", href: "/admin/workflow-templates" },
        ]) },
        { section: "FINANCE", items: withIcons([
          { label: "Payments", href: "/payments" },
          { label: "Statement of Account", href: "/soa" },
        ]) },
        { section: "CUSTOMERS", items: withIcons([{ label: "Customers", href: "/customers" }]) },
        { section: "MANAGEMENT", items: withIcons([
          { label: "Users", href: "/admin/users" },
          { label: "Staff & Permissions", href: "/admin/staff-permissions" },
          { label: "Reward Rules", href: "/admin/rewards" },
          { label: "Transaction Summary", href: "/reports/summary" },
        ]) },
        { section: "SYSTEM", items: withIcons([
          { label: "Audit Log", href: "/admin/audit-log" },
          { label: "Business Settings", href: "/admin/settings" },
          { label: "Email Settings", href: "/admin/email-settings" },
          { label: "Email Log", href: "/admin/email-log" },
          { label: "Messenger Settings", href: "/admin/messenger-settings" },
          { label: "Messenger Log", href: "/admin/messenger-log" },
          { label: "Authentication Settings", href: "/admin/auth-settings" },
          { label: "Themes", href: "/admin/themes" },
          { label: "Plugins", href: "/admin/plugins" },
          { label: "System Updates", href: "/admin/system-updates" },
        ]) },
      ];
    case "STAFF": {
      const allowed = STAFF_NAV_RULES.filter((item) => !item.permission || staffPermissions?.has(item.permission));
      const sections = ["MAIN", "OPERATIONS", "FINANCE", "CUSTOMERS", "MANAGEMENT", "SYSTEM"];
      return sections
        .map((section) => ({ section, items: withIcons(allowed.filter((i) => i.section === section)) }))
        .filter((s) => s.items.length > 0);
    }
    case "PRODUCTION":
      return [{ section: "MAIN", items: withIcons([
        { label: "Production Queue", href: "/production" },
        { label: "Inventory", href: "/inventory" },
      ]) }];
    case "CUSTOMER":
      // Grouped per spec item 9. "Invoices" and "Statement of Account" are
      // deliberately separate labels over the same real routes as their
      // sibling items (/orders, /payments) rather than invented pages —
      // this app has no standalone Invoice entity (an Invoice is an
      // Order's print view, same call already made for the Admin Quick
      // Actions menu) and /payments already doubles as this customer's
      // Payments + Statement of Account hub. Chat/Notifications aren't
      // routes — they stay header-only (bell + chat icon), so there's no
      // COMMUNICATION section here, matching the explicit instruction not
      // to reintroduce a standalone Messages page.
      return [
        {
          section: "MAIN",
          items: [
            { label: "Dashboard", href: "/dashboard", iconKey: "dashboard" },
            { label: "Inquiries", href: "/inquiries", iconKey: "inbox" },
            { label: "Quotations", href: "/quotations", iconKey: "fileText" },
            { label: "Orders", href: "/orders", iconKey: "package" },
            { label: "Invoices", href: "/orders", iconKey: "receipt" },
          ],
        },
        {
          section: "FINANCE",
          items: [
            { label: "Payments", href: "/payments", iconKey: "wallet" },
            { label: "Statement of Account", href: "/payments", iconKey: "barChart" },
          ],
        },
        {
          section: "ACCOUNT",
          items: [
            { label: "My Rewards", href: "/account/rewards", iconKey: "gift" },
            { label: "My Profile", href: "/account/profile", iconKey: "userCircle" },
            { label: "Login & Security", href: "/account/profile", iconKey: "keyRound" },
          ],
        },
      ];
    default:
      return [];
  }
}
