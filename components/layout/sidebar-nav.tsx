"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { isNavItemActive } from "./is-nav-item-active";
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
  Palette,
  Puzzle,
  RefreshCw,
  Percent,
  ReceiptText,
  LineChart,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavSection } from "./nav-config";

/** Resolves nav-config.ts's icon KEYS (plain strings, safe to receive as a prop from the Server Component Shell) to the actual Lucide components — this lookup has to live client-side since a component reference itself can't cross the server/client boundary as a prop. */
const ICON_COMPONENTS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  fileText: FileText,
  package: Package,
  factory: Factory,
  boxes: Boxes,
  wrench: Wrench,
  gitBranch: GitBranch,
  wallet: Wallet,
  receipt: Receipt,
  barChart: BarChart3,
  users: Users,
  userCog: UserCog,
  shieldCheck: ShieldCheck,
  gift: Gift,
  scrollText: ScrollText,
  settings: Settings,
  mail: Mail,
  mailCheck: MailCheck,
  messageSquare: MessageSquare,
  messagesSquare: MessagesSquare,
  keyRound: KeyRound,
  userCircle: UserCircle,
  palette: Palette,
  puzzle: Puzzle,
  refreshCw: RefreshCw,
  percent: Percent,
  receiptText: ReceiptText,
  lineChart: LineChart,
};

/** Grouped, optionally-collapsible sidebar nav (spec items 6/7) — used by both the desktop sidebar and the mobile drawer. */
export function SidebarNav({ sections, collapsed = false }: { sections: NavSection[]; collapsed?: boolean }) {
  const pathname = usePathname();
  const currentView = useSearchParams().get("view");

  return (
    <nav className="flex flex-col gap-4">
      {sections.map((section) => (
        <div key={section.section} className="flex flex-col gap-0.5">
          {!collapsed && (
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{section.section}</p>
          )}
          {section.items.map((item) => {
            const active = isNavItemActive(pathname, currentView, item.href);
            const Icon = item.iconKey ? ICON_COMPONENTS[item.iconKey] : undefined;
            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-2",
                  active
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
