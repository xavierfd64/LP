import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import type { getBusinessInsights } from "@/lib/dashboard-data";

/** Spec item 12 — secondary metrics, deliberately smaller/quieter than the primary KPI row so they never compete with it. */
export function BusinessInsights({ insights }: { insights: Awaited<ReturnType<typeof getBusinessInsights>> }) {
  const tiles = [
    { label: "QC Pass Rate", value: insights.qcPassRate !== null ? `${insights.qcPassRate}%` : "—", sub: `${insights.qcPass} pass / ${insights.qcFail} fail` },
    { label: "Low Stock Items", value: insights.lowStockItems, href: "/inventory" },
    { label: "New Customers (mo.)", value: insights.newCustomersThisMonth },
    { label: "Returning Customers (mo.)", value: insights.returningCustomersThisMonth },
    { label: "Points Issued (mo.)", value: insights.pointsIssued, href: "/admin/rewards" },
    { label: "Points Redeemed (mo.)", value: insights.pointsRedeemed, href: "/admin/rewards" },
  ];

  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Business Insights" />
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => {
          const inner = (
            <div className="rounded-md border border-slate-100 px-2.5 py-2">
              <p className="text-base font-bold text-slate-900">{t.value}</p>
              <p className="text-[11px] text-slate-500">{t.label}</p>
              {"sub" in t && t.sub && <p className="text-[10px] text-slate-400">{t.sub}</p>}
            </div>
          );
          return t.href ? (
            <Link key={t.label} href={t.href} className="transition-opacity hover:opacity-80">
              {inner}
            </Link>
          ) : (
            <div key={t.label}>{inner}</div>
          );
        })}
      </CardContent>
    </Card>
  );
}
