"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export type QuickAction = { label: string; href: string };

/**
 * "+ New Transaction" (spec item 10/30) — every option links straight to
 * the existing creation form/page (no new forms). There's no standalone
 * "New Job Order" or "New Invoice" route in this app — Job Orders are
 * added from within an Order, and an Invoice is the Order's own print
 * view (see the 4th update's Master Transaction work) — so those aren't
 * offered as separate actions here, only what genuinely exists.
 */
export function QuickActionMenu({ actions }: { actions: QuickAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  if (actions.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <Button type="button" onClick={() => setOpen((o) => !o)}>
        <Plus className="h-4 w-4" /> New Transaction <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-52 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
