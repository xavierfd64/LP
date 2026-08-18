"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { RevenueTrendChart } from "@/components/dashboard/admin-charts";
import { formatCurrency, cn } from "@/lib/utils";
import { getFinancialOverviewAction } from "@/app/actions/dashboard";
import type { FinancialPeriod } from "@/lib/dashboard-data";

const PERIODS: { key: FinancialPeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "semiannual", label: "Semi-Annual" },
  { key: "year", label: "Year" },
];

type Overview = { data: { month: string; revenue: number; orders: number }[]; totalRevenue: number; totalOrders: number };

/** Spec item 14 — reuses the existing RevenueTrendChart as-is; only the period and its resulting bucketed data change. */
export function FinancialOverview({ initial }: { initial: Overview }) {
  const [period, setPeriod] = useState<FinancialPeriod>("month");
  const [overview, setOverview] = useState<Overview>(initial);
  const [pending, startTransition] = useTransition();

  function selectPeriod(p: FinancialPeriod) {
    setPeriod(p);
    startTransition(async () => {
      const next = await getFinancialOverviewAction(p);
      setOverview(next);
    });
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Financial Overview" />
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => selectPeriod(p.key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                period === p.key ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className={cn("mb-1 text-lg font-bold text-slate-900", pending && "opacity-50")}>{formatCurrency(overview.totalRevenue)}</p>
        <p className="mb-2 text-xs text-slate-400">{overview.totalOrders} orders in this period</p>
        <div className={cn(pending && "opacity-50")}>
          <RevenueTrendChart data={overview.data} />
        </div>
      </CardContent>
    </Card>
  );
}
