"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
  Line,
  Cell,
  PieChart,
  Pie,
  LabelList,
} from "recharts";

/** Generic categorical palette (Payment Methods, Top Services, Sales Overview legend, Service Cost Breakdown) — the same semantic tokens every other chart/badge/button reads, cycled when a series has more categories than colors. */
const PALETTE = [
  "var(--color-error-600)",
  "var(--color-info-600)",
  "var(--color-success-600)",
  "var(--color-warning-600)",
  "var(--color-accent-600)",
  "var(--color-secondary-600)",
];
const money = (v: number) => `₱${Number(v).toLocaleString()}`;
const moneyShort = (v: number) => (v >= 1000 ? `₱${Math.round(v / 1000)}k` : `₱${v}`);

/**
 * Mirrors components/ui/badge.tsx's STATUS_TONE mapping so chart colors
 * match the status badges used everywhere else. Values are CSS custom
 * properties (the same theme tokens every other component reads — see
 * app/globals.css/lib/themes.ts), not literal hex, so these charts recolor
 * automatically with the active theme/admin color customization instead of
 * always rendering the 2026 defaults regardless of theme (SVG presentation
 * attributes like `fill` resolve var() the same way any CSS property does).
 */
const STATUS_COLORS: Record<string, string> = {
  NEW: "var(--color-info-600)",
  OPEN: "var(--color-info-600)",
  SENT: "var(--color-info-600)",
  SCHEDULED: "var(--color-info-600)",
  BOOKED: "var(--color-info-600)",
  QUOTED: "var(--color-accent-600)",
  IN_PRODUCTION: "var(--color-accent-600)",
  FULFILLING: "var(--color-accent-600)",
  IN_PROGRESS: "var(--color-accent-600)",
  IN_TRANSIT: "var(--color-accent-600)",
  COMPLETED: "var(--color-success-600)",
  APPROVED: "var(--color-success-600)",
  CONFIRMED: "var(--color-success-600)",
  DELIVERED: "var(--color-success-600)",
  READY: "var(--color-success-600)",
  CANCELLED: "var(--color-error-600)",
  REJECTED: "var(--color-error-600)",
  ON_HOLD: "var(--color-warning-600)",
  PENDING: "var(--color-warning-600)",
  REVISION_REQUESTED: "var(--color-warning-600)",
  CLOSED: "var(--color-secondary-600)",
  DRAFT: "var(--color-secondary-600)",
};
const DEFAULT_COLOR = "var(--color-brand-600)";

const axisTick = { fontSize: 11, fill: "#64748b" };
const tooltipStyle = { fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" };
const label = (v: string) => v.replace(/_/g, " ");

/** `variant="donut"` is the Nextgen theme's presentation of the exact same data (spec item 21: "keep existing functionality, improve presentation") — never a second query or a different dataset, just a different chart shape. */
export function OrdersByStatusChart({ data, variant = "bar" }: { data: { status: string; count: number }[]; variant?: "bar" | "donut" }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No orders yet.</p>;
  }

  if (variant === "donut") {
    const total = data.reduce((sum, d) => sum + d.count, 0);
    return (
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative h-[180px] w-[180px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {data.map((d) => (
                  <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? DEFAULT_COLOR} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [value, "Orders"]} labelFormatter={(v) => label(String(v))} contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-slate-900">{total}</span>
            <span className="text-[11px] text-slate-500">Total Orders</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 text-xs text-slate-600">
          {data.map((d) => (
            <span key={d.status} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[d.status] ?? DEFAULT_COLOR }} />
              <span className="font-medium text-slate-700">{label(d.status)}</span>
              <span className="text-slate-400">
                {d.count} ({total > 0 ? Math.round((d.count / total) * 100) : 0}%)
              </span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="status" tick={axisTick} tickFormatter={label} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis allowDecimals={false} tick={axisTick} width={28} />
        <Tooltip formatter={(value) => [value, "Orders"]} labelFormatter={(v) => label(String(v))} contentStyle={tooltipStyle} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? DEFAULT_COLOR} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RevenueTrendChart({ data }: { data: { month: string; revenue: number; orders: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No activity yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="month" tick={axisTick} />
        <YAxis
          yAxisId="revenue"
          tick={axisTick}
          width={44}
          tickFormatter={(v: number) => (v >= 1000 ? `₱${Math.round(v / 1000)}k` : `₱${v}`)}
        />
        <YAxis yAxisId="orders" orientation="right" allowDecimals={false} tick={axisTick} width={28} />
        <Tooltip
          formatter={(value, name) =>
            name === "Revenue" ? [`₱${Number(value).toLocaleString()}`, "Revenue"] : [value, "Orders"]
          }
          contentStyle={tooltipStyle}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="orders" dataKey="orders" name="Orders" fill="var(--color-brand-100)" radius={[4, 4, 0, 0]} />
        <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Revenue" stroke="var(--color-brand-600)" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function PaymentsByMethodChart({ data }: { data: { method: string; total: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No confirmed payments in this period.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="method" tick={axisTick} tickFormatter={label} />
        <YAxis
          tick={axisTick}
          width={44}
          tickFormatter={(v: number) => (v >= 1000 ? `₱${Math.round(v / 1000)}k` : `₱${v}`)}
        />
        <Tooltip formatter={(value) => [`₱${Number(value).toLocaleString()}`, "Total"]} labelFormatter={(v) => label(String(v))} contentStyle={tooltipStyle} />
        <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="var(--color-brand-600)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** "Sales Overview" grouped bar (Whiskey dashboard reference) — Total Sales / Payments / Outstanding per week, with a visible legend above the chart matching the reference's exact layout. */
export function SalesOverviewChart({ data }: { data: { week: string; totalSales: number; payments: number; outstanding: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No sales activity yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="week" tick={axisTick} />
        <YAxis tick={axisTick} width={44} tickFormatter={moneyShort} />
        <Tooltip formatter={(value, name) => [money(Number(value)), name]} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="totalSales" name="Total Sales" fill="var(--color-info-600)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="payments" name="Payments" fill="var(--color-success-600)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="outstanding" name="Outstanding" fill="var(--color-error-600)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** "Top Services by Revenue" ranked horizontal bar (Whiskey dashboard reference), each bar labeled with its peso value at the end, matching the reference's readable-without-hovering requirement. */
export function TopServicesRevenueChart({ data }: { data: { name: string; revenue: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No confirmed order revenue yet this month.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" tick={axisTick} tickFormatter={moneyShort} hide />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} width={110} interval={0} />
        <Tooltip formatter={(value) => [money(Number(value)), "Revenue"]} contentStyle={tooltipStyle} />
        <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />
          ))}
          <LabelList dataKey="revenue" position="right" formatter={(v) => money(Number(v))} style={{ fontSize: 11, fill: "#334155" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** "Service Cost Breakdown" pie + legend (Whiskey dashboard reference) — Material/Labor/Overhead/Profit Margin, each with its peso value and share of the suggested price, exactly as the reference shows. */
export function ServiceCostBreakdownChart({
  materialCost,
  laborCost,
  overheadCost,
  profitMargin,
}: {
  materialCost: number;
  laborCost: number;
  overheadCost: number;
  profitMargin: number | null;
}) {
  const slices = [
    { label: "Material Cost", value: materialCost, color: PALETTE[0] },
    { label: "Labor Cost", value: laborCost, color: PALETTE[1] },
    { label: "Overhead", value: overheadCost, color: PALETTE[2] },
    ...(profitMargin != null ? [{ label: "Profit Margin", value: profitMargin, color: PALETTE[3] }] : []),
  ].filter((s) => s.value > 0);
  const total = slices.reduce((s, d) => s + d.value, 0);

  if (slices.length === 0) {
    return <p className="text-sm text-slate-400">No cost data available.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="h-[150px] w-[150px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={70}>
              {slices.map((s) => (
                <Cell key={s.label} fill={s.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [money(Number(value)), ""]} contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 text-xs text-slate-600">
        {slices.map((s) => (
          <span key={s.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="font-medium text-slate-700">{s.label}</span>
            </span>
            <span className="whitespace-nowrap text-slate-500">
              {money(s.value)} <span className="text-slate-400">({total > 0 ? Math.round((s.value / total) * 100) : 0}%)</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** "Monthly Profit & Loss" bar with a value label above each bar (Whiskey dashboard reference) — Revenue / Production Cost / Operating Expenses / Net Profit, the exact fields computeFinancialFoundation already returns (never a Material/Labor split it doesn't provide). */
export function MonthlyPLChart({
  revenue,
  productionCost,
  operatingExpenses,
  netProfit,
}: {
  revenue: number;
  productionCost: number;
  operatingExpenses: number;
  netProfit: number | null;
}) {
  const bars = [
    { name: "Revenue", value: revenue, color: "var(--color-success-600)" },
    { name: "Production Cost", value: productionCost, color: "var(--color-error-600)" },
    { name: "Operating Expenses", value: operatingExpenses, color: "var(--color-warning-600)" },
    { name: "Net Profit", value: netProfit ?? 0, color: "var(--color-info-600)" },
  ];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={bars} margin={{ top: 20, right: 8, left: -8, bottom: 12 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} angle={-15} textAnchor="end" height={40} />
        <YAxis tick={axisTick} width={44} tickFormatter={moneyShort} />
        <Tooltip formatter={(value) => [money(Number(value)), ""]} contentStyle={tooltipStyle} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {bars.map((b) => (
            <Cell key={b.name} fill={b.color} />
          ))}
          <LabelList dataKey="value" position="top" formatter={(v) => money(Number(v))} style={{ fontSize: 11, fontWeight: 600, fill: "#334155" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** "Payment Methods" donut + legend (Whiskey dashboard reference) — same donut-with-center-total-and-legend pattern as OrdersByStatusChart's donut variant, applied to confirmed Payment amounts grouped by method. */
export function PaymentMethodsDonutChart({ data }: { data: { method: string; total: number; pct: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No confirmed payments in this period.</p>;
  }
  const total = data.reduce((s, d) => s + d.total, 0);
  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="method" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
              {data.map((d, i) => (
                <Cell key={d.method} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [money(Number(value)), "Total"]} labelFormatter={(v) => label(String(v))} contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-slate-900">{money(total)}</span>
          <span className="text-[11px] text-slate-500">Total Payments</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-xs text-slate-600">
        {data.map((d, i) => (
          <span key={d.method} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
            <span className="font-medium text-slate-700">{label(d.method)}</span>
            <span className="text-slate-400">
              {money(d.total)} ({d.pct}%)
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProductionStatusChart({ data }: { data: { status: string; count: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No job orders yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" allowDecimals={false} tick={axisTick} />
        <YAxis type="category" dataKey="status" tick={axisTick} tickFormatter={label} width={100} />
        <Tooltip formatter={(value) => [value, "Job Orders"]} labelFormatter={(v) => label(String(v))} contentStyle={tooltipStyle} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((d) => (
            <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? DEFAULT_COLOR} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
