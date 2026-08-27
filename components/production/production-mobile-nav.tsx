"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Columns3, Plus, Bell, MoreHorizontal, X, Settings, BarChart3, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Production-only mobile bottom nav (illustration 6). Staff/Admin/
 * Production accounts get no bottom nav anywhere else in the app (see
 * components/layout/mobile-bottom-nav.tsx's own doc comment — that one is
 * explicitly customer-only, and Shell only ever mounts it for
 * role==="CUSTOMER"), so this is scoped to the Production route group only
 * — mounted directly by the Overview and focused-board pages, not Shell,
 * so it never appears anywhere else and never competes with the customer
 * nav's role gate.
 *
 * "Add Job" dispatches a window event rather than owning any dialog state
 * itself — both Production pages mount their own <AddJobDialog>, which
 * listens for "production:add-job" (see that component) so this nav works
 * identically whether it's rendered on the Overview or a focused board.
 * "Notifications" reuses the existing header bell the same way — see
 * NotificationBell's own "production:*"-style event listener.
 */
export function ProductionMobileNav({ canSeeSettings, canSeeReports }: { canSeeSettings: boolean; canSeeReports: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const onBoard = pathname.startsWith("/production/board/");

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-x-0 top-0 h-[100dvh] z-50 md:hidden">
          <div className="fixed inset-x-0 top-0 h-[100dvh] bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 rounded-t-xl border-t border-slate-200 bg-white p-3 pb-6 shadow-xl">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-slate-900">More</p>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close menu" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {canSeeSettings && (
                <Link href="/admin/workflow-templates" className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-100 px-2 py-3 text-center text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <Settings className="h-5 w-5 text-brand-600" /> Settings
                </Link>
              )}
              {canSeeReports && (
                <Link href="/reports/summary" className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-100 px-2 py-3 text-center text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <BarChart3 className="h-5 w-5 text-brand-600" /> Reports
                </Link>
              )}
            </div>
            <form action="/api/logout" method="POST" className="mt-2">
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-100 px-2 py-3 text-sm font-medium text-red-600 hover:bg-red-50">
                <LogOut className="h-4 w-4" /> Sign Out
              </button>
            </form>
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-slate-200 bg-white md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <Link href="/production" className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", !onBoard ? "text-brand-600" : "text-slate-500")}>
          <LayoutGrid className="h-5 w-5" />
          Overview
        </Link>
        <Link href="/production#production-services" className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", onBoard ? "text-brand-600" : "text-slate-500")}>
          <Columns3 className="h-5 w-5" />
          Boards
        </Link>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("production:add-job"))}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium text-slate-500"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white shadow-md">
            <Plus className="h-5 w-5" />
          </span>
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("production:open-notifications"))}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"
        >
          <Bell className="h-5 w-5" />
          Notifications
        </button>
        <button type="button" onClick={() => setMoreOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500">
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>
    </>
  );
}
