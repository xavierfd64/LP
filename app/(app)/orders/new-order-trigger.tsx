"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewOrderModal } from "./new-order-modal";
import { HistoricalOrderModal } from "./historical-order-modal";

/**
 * "+ New Order" — a plain button when the signed-in user can only create
 * normal orders, or a split/dropdown ("New Order" / "Encode Old Order")
 * when they also hold ORDER_BACKDATE (Historical Transaction Encoding,
 * Sept 3). Encode Old Order is a controlled, separately-permissioned
 * action, never just a second click target on the same button.
 */
export function NewOrderTrigger({ canEncodeHistorical = false }: { canEncodeHistorical?: boolean }) {
  const [newOpen, setNewOpen] = useState(false);
  const [historicalOpen, setHistoricalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  if (!canEncodeHistorical) {
    return (
      <>
        <Button onClick={() => setNewOpen(true)}>+ New Order</Button>
        <NewOrderModal open={newOpen} onClose={() => setNewOpen(false)} />
      </>
    );
  }

  return (
    <div ref={ref} className="relative">
      <Button type="button" onClick={() => setMenuOpen((o) => !o)}>
        + New Order <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {menuOpen && (
        <div className="absolute right-0 z-30 mt-1 w-52 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setNewOpen(true);
            }}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            New Order
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setHistoricalOpen(true);
            }}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Encode Old Order
          </button>
        </div>
      )}

      <NewOrderModal open={newOpen} onClose={() => setNewOpen(false)} />
      <HistoricalOrderModal open={historicalOpen} onClose={() => setHistoricalOpen(false)} />
    </div>
  );
}
