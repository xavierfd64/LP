"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Package, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/components/ui/relative-time";
import { READY_COLUMN, type ServiceBoard } from "@/lib/production-board-types";
import { renderStageIcon } from "@/lib/production-icons";

const ICON_TONES = [
  "bg-purple-100 text-purple-600",
  "bg-emerald-100 text-emerald-600",
  "bg-amber-100 text-amber-600",
  "bg-pink-100 text-pink-600",
  "bg-blue-100 text-blue-600",
  "bg-slate-200 text-slate-600",
];

/**
 * Production Overview's service-summary section (illustration 1's "All
 * Active Services" tab strip + per-service rows). A distinct client
 * component from the Overview server page so Search/tab-filter state stays
 * local without making the whole Overview a Client Component (it still
 * needs the server-fetched `boards` — the exact same real data the focused
 * board page reads, never a second query).
 */
export function ServiceOverviewList({ boards }: { boards: ServiceBoard[] }) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("");

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return boards.filter((b) => {
      if (activeTab && b.key !== activeTab) return false;
      if (q && !b.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [boards, activeTab, q]);

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search job orders, customers, services..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("")}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium",
              activeTab === "" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            All Active Services
          </button>
          {boards.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setActiveTab(b.key)}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium",
                activeTab === b.key ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50"
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <h2 className="text-sm font-semibold text-slate-900">Production Services</h2>

      <div className="space-y-3">
        {visible.map((board, i) => {
          const realColumns = board.columns.filter((c) => c.name !== READY_COLUMN);
          const activeCount = board.jobOrders.length;
          const overdueCount = board.jobOrders.filter((j) => j.overdue).length;
          const lastUpdated = board.jobOrders.reduce<string | null>(
            (latest, j) => (!latest || j.updatedAt > latest ? j.updatedAt : latest),
            null
          );
          return (
            <div key={board.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", ICON_TONES[i % ICON_TONES.length])}>
                    {renderStageIcon(board.label, "h-5 w-5")}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{board.label}</p>
                    <p className="text-xs text-slate-400">
                      {lastUpdated ? (
                        <>
                          Last updated: <RelativeTime iso={lastUpdated} />
                        </>
                      ) : (
                        "No active jobs"
                      )}
                    </p>
                  </div>
                </div>
                <Link href={`/production/board/${encodeURIComponent(board.key)}`} className="shrink-0">
                  <Button type="button" variant="outline" size="sm">
                    Open Board <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>

              {realColumns.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-3">
                  {realColumns.map((col) => (
                    <div key={col.name} className="text-xs">
                      <p className="font-medium uppercase tracking-wide text-slate-400">{col.name}</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {board.jobOrders.filter((j) => j.column === col.name).length}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
                  No production workflow is assigned to this service yet.
                </p>
              )}

              <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs">
                <span className="text-slate-500">
                  <span className="font-semibold text-slate-900">{activeCount}</span> Active Jobs
                </span>
                {overdueCount > 0 && (
                  <span className="font-medium text-red-600">{overdueCount} Overdue</span>
                )}
              </div>
            </div>
          );
        })}

        {visible.length === 0 && (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-slate-200 py-10 text-center">
            <Package className="h-6 w-6 text-slate-300" />
            <p className="text-sm text-slate-400">No services match this search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
