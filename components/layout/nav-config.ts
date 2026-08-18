import { Permission } from "@/lib/permissions";
import {
  LayoutDashboard,
  Inbox,
  FileText,
  Package,
  Factory,
  Boxes,
  Wrench,
  GitBranch,
  Wallet,
  Receipt,
  BarChart3,
  Users,
  UserCog,
  ShieldCheck,
  Gift,
  ScrollText,
  Settings,
  Mail,
  MailCheck,
  MessageSquare,
  MessagesSquare,
  KeyRound,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; href: string; icon?: LucideIcon };
export type NavSection = { section: string; items: NavItem[] };

/** One shared icon per destination — sidebar-nav.tsx renders these next to the label (expanded) or alone with a tooltip (collapsed), spec item 6/7. */
const ICONS: Record<string, LucideIcon> = {
  "/admin/dashboard": LayoutDashboard,
  "/dashboard": LayoutDashboard,
  "/inquiries": Inbox,
  "/quotations": FileText,
  "/orders": Package,
  "/production": Factory,
  "/inventory": Boxes,
  "/admin/services": Wrench,
  "/admin/workflow-templates": GitBranch,
  "/payments": Wallet,
  "/soa": Receipt,
  "/reports/summary": BarChart3,
  "/customers": Users,
  "/admin/users": UserCog,
  "/admin/staff-permissions": ShieldCheck,
  "/admin/rewards": Gift,
  "/admin/audit-log": ScrollText,
  "/admin/settings": Settings,
  "/admin/email-settings": Mail,
  "/admin/email-log": MailCheck,
  "/admin/messenger-settings": MessageSquare,
  "/admin/messenger-log": MessagesSquare,
  "/admin/auth-settings": KeyRound,
  "/account/rewards": Gift,
  "/account/profile": UserCircle,
};

function withIcons(items: { label: string; href: string }[]): NavItem[] {
  return items.map((i) => ({ ...i, icon: ICONS[i.href] }));
}

const STAFF_NAV_RULES: { section: string; label: string; href: string; permission?: Permission }[] = [
  { section: "MAIN", label: "Dashboard", href: "/dashboard" },
  { section: "MAIN", label: "Inquiries", href: "/inquiries", permission: "INQUIRY_VIEW" },
  { section: "MAIN", label: "Quotations", href: "/quotations", permission: "QUOTATION_VIEW" },
  { section: "MAIN", label: "Orders", href: "/orders", permission: "ORDER_VIEW" },
  { section: "OPERATIONS", label: "Production", href: "/production", permission: "PRODUCTION_VIEW" },
  { section: "OPERATIONS", label: "Inventory", href: "/inventory" },
  { section: "OPERATIONS", label: "Services", href: "/admin/services", permission: "SERVICE_VIEW" },
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
      return [{ section: "MAIN", items: withIcons([
        { label: "Dashboard", href: "/dashboard" },
        { label: "My Inquiries", href: "/inquiries" },
        { label: "My Quotations", href: "/quotations" },
        { label: "My Orders", href: "/orders" },
        { label: "Payment", href: "/payments" },
        { label: "My Rewards", href: "/account/rewards" },
        { label: "My Profile", href: "/account/profile" },
      ]) }];
    default:
      return [];
  }
}
