import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Primary KPI tile (spec item 11) — the number is the dominant element,
 * a subtitle carries the trend/context, and the whole card is clickable
 * when a destination makes sense. Kept visually uniform across the row
 * (spec item 25's "do not make every card visually different").
 */
export function KpiCard({
  label,
  value,
  sub,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  tone?: "attention" | "default";
}) {
  const content = (
    <Card className={cn("h-full transition-shadow hover:shadow-md", tone === "attention" && "border-red-200")}>
      <CardContent className="py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">{value}</p>
        {sub && <p className={cn("mt-0.5 text-xs", tone === "attention" ? "font-medium text-red-600" : "text-slate-400")}>{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
