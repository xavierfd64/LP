"use client";

import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight, Printer } from "lucide-react";
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
        // sticky + h-screen (Whiskey reference: the sidebar and its bottom
        // promo panel stay in view rather than scrolling away with a long
        // page) — safe here because Shell's root is a plain flex row with
        // no height constraint of its own on this child.
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-bg)] px-3 py-4 transition-[width] duration-150 md:flex",
        collapsed ? "w-[68px]" : "w-60"
      )}
    >
      <div className={cn("mb-6 flex items-center px-2", collapsed ? "justify-center" : "gap-2")}>
        <BrandLogo src={logoPath} alt={businessName} size={32} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-[var(--color-sidebar-heading)]">{businessName}</p>
            {tagline && <p className="truncate text-xs text-[var(--color-sidebar-text-muted)]">{tagline}</p>}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <SidebarNav sections={sections} collapsed={collapsed} />
      </div>
      {/* Decorative brand panel (Whiskey dashboard reference) — reuses the
          real businessName/tagline already passed into this component
          rather than inventing separate marketing copy, so nothing here
          is fabricated content. Hidden collapsed (no room for its text). */}
      {!collapsed && tagline && (
        <div className="mb-2 rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 p-3 text-white">
          <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-white/15">
            <Printer className="h-4 w-4" />
          </div>
          <p className="text-sm font-bold leading-tight">{businessName}</p>
          <p className="mt-0.5 text-xs text-white/80">{tagline}</p>
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        className="mt-2 flex items-center justify-center gap-2 rounded-md border border-[var(--color-sidebar-border)] py-2 text-xs text-[var(--color-sidebar-text-muted)] hover:bg-[var(--color-sidebar-hover-bg)]"
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
