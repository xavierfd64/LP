"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NavSection } from "./nav-config";

/** Grouped, optionally-collapsible sidebar nav (spec items 6/7) — used by both the desktop sidebar and the mobile drawer. */
export function SidebarNav({ sections, collapsed = false }: { sections: NavSection[]; collapsed?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-4">
      {sections.map((section) => (
        <div key={section.section} className="flex flex-col gap-0.5">
          {!collapsed && (
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{section.section}</p>
          )}
          {section.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
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
