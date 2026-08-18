"use client";

import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";
import { NavSection } from "./nav-config";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/branding/brand-logo";

const STORAGE_KEY = "lp-sidebar-collapsed";

/** Collapsible desktop sidebar (spec item 7) — expanded shows logo + labels, collapsed shows icons + title tooltips; the main content area expands via the flex layout in Shell since this <aside> just shrinks its own width. State persists across visits via localStorage (no server round-trip needed for a pure display preference). */
export function DesktopSidebar({
  sections,
  businessName,
  tagline,
  logoPath,
}: {
  sections: NavSection[];
  businessName: string;
  tagline?: string | null;
  logoPath?: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4 transition-[width] duration-150 md:flex",
        collapsed ? "w-[68px]" : "w-60"
      )}
    >
      <div className={cn("mb-6 flex items-center px-2", collapsed ? "justify-center" : "gap-2")}>
        <BrandLogo src={logoPath} alt={businessName} size={32} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-slate-900">{businessName}</p>
            {tagline && <p className="truncate text-xs text-slate-400">{tagline}</p>}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <SidebarNav sections={sections} collapsed={collapsed} />
      </div>
      <button
        type="button"
        onClick={toggle}
        className="mt-2 flex items-center justify-center gap-2 rounded-md border border-slate-200 py-2 text-xs text-slate-500 hover:bg-slate-50"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : undefined}
      >
        {collapsed ? (
          <ChevronsRight className="h-4 w-4" />
        ) : (
          <>
            <ChevronsLeft className="h-4 w-4" /> Collapse
          </>
        )}
      </button>
    </aside>
  );
}
