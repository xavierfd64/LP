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
} from "recharts";

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
