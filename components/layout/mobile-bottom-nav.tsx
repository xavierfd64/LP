"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, Package, Receipt, FileBarChart, MoreHorizontal, X, FileText, Wallet, Gift, MessageCircle, UserCircle, KeyRound, LogOut, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavItemActive } from "./is-nav-item-active";
import { LogoutForm } from "./logout-form";

const PRIMARY = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Orders", href: "/orders", icon: Package },
  { label: "Invoices", href: "/orders?view=invoices", icon: Receipt },
  { label: "SOA", href: "/payments?view=soa", icon: FileBarChart },
];

const MORE_LINKS = [
  { label: "Quotations", href: "/quotations", icon: FileText },
  { label: "Payments", href: "/payments", icon: Wallet },
  { label: "My Rewards", href: "/account/rewards", icon: Gift },
  { label: "My Profile", href: "/account/profile", icon: UserCircle },
  { label: "Login & Security", href: "/account/profile", icon: KeyRound },
];

/**
 * Customer-only mobile bottom nav (spec item 44) — kept to 4 always-visible
 * destinations plus a "More" sheet, deliberately not crowded. "Invoices"
 * routes to /orders (this app has no separate Invoice entity — an Invoice
 * is just an Order's print view, same architectural call as the Admin
 * Quick Actions menu) and "SOA" routes to /payments, which already doubles
 * as this customer's Payments + Statement of Account hub.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const currentView = useSearchParams().get("view");
  const [moreOpen, setMoreOpen] = useState(false);

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
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MORE_LINKS.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-100 px-2 py-3 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <l.icon className="h-5 w-5 text-brand-600" />
                  {l.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  window.dispatchEvent(new CustomEvent("chatbox:open"));
                }}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-100 px-2 py-3 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <MessageCircle className="h-5 w-5 text-brand-600" />
                Chat
              </button>
            </div>
            {/* See LogoutForm for why this stays a native form POST to a
                real Route Handler rather than a Server Action, and how the
                pending state below still paints immediately. */}
            <LogoutForm className="mt-2">
              {(pending) => (
                <button
                  type="submit"
                  disabled={pending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-100 px-2 py-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  {pending ? "Signing out…" : "Sign Out"}
                </button>
              )}
            </LogoutForm>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {PRIMARY.map((item) => {
          const active = isNavItemActive(pathname, currentView, item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                active ? "text-brand-600" : "text-slate-500"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>
    </>
  );
}
