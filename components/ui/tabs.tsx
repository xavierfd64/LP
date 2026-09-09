"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared underline-tab bar (Whiskey reference: Recent Transactions card,
 * View Order's Details/Items/Payments/... row) — a small, plain client
 * component so switching tabs never needs a page navigation or a Server
 * Action; callers own what each tab renders via `children` as a function
 * of the active key, since tab content shapes differ (a table vs. a
 * detail panel).
 */
export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: readonly { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-4 border-b border-slate-100", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            "-mb-px border-b-2 px-0.5 py-2 text-sm font-medium transition-colors",
            active === tab.key
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Convenience wrapper for the common case: local state, no external control needed. */
export function useTabs(tabs: { key: string; label: string }[], initial?: string) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key ?? "");
  return { active, setActive, tabs };
}

export function TabPanel({ active, forKey, children }: { active: string; forKey: string; children: ReactNode }) {
  if (active !== forKey) return null;
  return <>{children}</>;
}
