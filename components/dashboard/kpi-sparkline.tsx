"use client";

import { AreaChart, Area, ResponsiveContainer } from "recharts";

/**
 * Extracted out of KpiCard so KpiCard itself can stay a Server Component
 * — every existing caller passes `icon={SomeLucideIcon}` (a component
 * reference), which only Server→Server prop-passing allows; recharts
 * needs a Client Component boundary somewhere, so it lives here instead,
 * receiving only plain serializable data (numbers + a color string).
 */
export function KpiSparkline({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((v, i) => ({ i, v }));
  const gradientId = `spark-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div className="mt-2 h-8 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${gradientId})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
