"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";
import { NavSection } from "./nav-config";
import { BrandLogo } from "@/components/branding/brand-logo";

export function MobileNav({
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
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-x-0 top-0 h-[100dvh] z-50">
          <div className="fixed inset-x-0 top-0 h-[100dvh] bg-black/40" onClick={() => setOpen(false)} />
          <aside className="fixed inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col overflow-y-auto border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-bg)] px-3 py-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-2">
              <div className="flex min-w-0 items-center gap-2">
                <BrandLogo src={logoPath} alt={businessName} size={28} />
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-[var(--color-sidebar-heading)]">{businessName}</p>
                  {tagline && <p className="truncate text-xs text-[var(--color-sidebar-text-muted)]">{tagline}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-[var(--color-sidebar-text-muted)] hover:bg-[var(--color-sidebar-hover-bg)] hover:text-[var(--color-sidebar-heading)]"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav sections={sections} />
          </aside>
        </div>
      )}
    </div>
  );
}
