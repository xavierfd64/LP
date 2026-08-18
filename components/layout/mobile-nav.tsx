"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";
import { NavSection } from "./nav-config";

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
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="fixed inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col overflow-y-auto border-r border-slate-200 bg-white px-3 py-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-2">
              <div className="flex min-w-0 items-center gap-2">
                {logoPath && (
                  <Image src={logoPath} alt={businessName} width={28} height={28} className="h-7 w-7 shrink-0 rounded object-contain" unoptimized />
                )}
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-slate-900">{businessName}</p>
                  {tagline && <p className="truncate text-xs text-slate-400">{tagline}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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
