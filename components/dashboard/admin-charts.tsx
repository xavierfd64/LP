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
} from "recharts";

/** Mirrors components/ui/badge.tsx's STATUS_TONE mapping so chart colors match the status badges used everywhere else. */
const STATUS_COLORS: Record<string, string> = {
  NEW: "#3b82f6",
  OPEN: "#3b82f6",
  SENT: "#3b82f6",
  SCHEDULED: "#3b82f6",
  BOOKED: "#3b82f6",
  QUOTED: "#a855f7",
  IN_PRODUCTION: "#a855f7",
  FULFILLING: "#a855f7",
  IN_PROGRESS: "#a855f7",
  IN_TRANSIT: "#a855f7",
  COMPLETED: "#16a34a",
  APPROVED: "#16a34a",
  CONFIRMED: "#16a34a",
  DELIVERED: "#16a34a",
  READY: "#16a34a",
  CANCELLED: "#dc2626",
  REJECTED: "#dc2626",
  ON_HOLD: "#ca8a04",
  PENDING: "#ca8a04",
  REVISION_REQUESTED: "#ca8a04",
  CLOSED: "#64748b",
  DRAFT: "#64748b",
};
const DEFAULT_COLOR = "#dc2626";

const axisTick = { fontSize: 11, fill: "#64748b" };
const tooltipStyle = { fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" };
const label = (v: string) => v.replace(/_/g, " ");

export function OrdersByStatusChart({ data }: { data: { status: string; count: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No orders yet.</p>;
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
        <Bar yAxisId="orders" dataKey="orders" name="Orders" fill="#fecaca" radius={[4, 4, 0, 0]} />
        <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Revenue" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
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
