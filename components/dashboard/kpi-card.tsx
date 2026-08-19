import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ICON_TONE_CLASSES: Record<string, string> = {
  blue: "bg-info-100 text-info-600",
  red: "bg-error-100 text-error-600",
  orange: "bg-warning-100 text-warning-600",
  purple: "bg-accent-100 text-accent-600",
  green: "bg-success-100 text-success-600",
};

/**
 * Primary KPI tile (spec item 11) — the number is the dominant element,
 * a subtitle carries the trend/context, and the whole card is clickable
 * when a destination makes sense. Kept visually uniform across the row
 * (spec item 25's "do not make every card visually different").
 *
 * `icon`/`iconTone` are Nextgen-theme-only (Aug 19 1st update) — a plain
 * Server Component prop (no client boundary crossed, unlike the earlier
 * nav-icon lesson: both this component and every caller are Server
 * Components), rendered only when the caller passes them, which callers
 * only do when the active theme is "nextgen". The 2026 theme's cards stay
 * exactly as before when these are omitted.
 */
export function KpiCard({
  label,
  value,
  sub,
  href,
  tone,
  icon: Icon,
  iconTone = "blue",
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  tone?: "attention" | "default";
  icon?: React.ComponentType<{ className?: string }>;
  iconTone?: "blue" | "red" | "orange" | "purple" | "green";
}) {
  const content = (
    <Card className={cn("h-full transition-shadow hover:shadow-md", tone === "attention" && "border-red-200")}>
      <CardContent className="py-4">
        {Icon && (
          <div className={cn("mb-2 flex h-9 w-9 items-center justify-center rounded-lg", ICON_TONE_CLASSES[iconTone])}>
            <Icon className="h-4.5 w-4.5" />
          </div>
        )}
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">{value}</p>
        {sub && <p className={cn("mt-0.5 text-xs", tone === "attention" ? "font-medium text-red-600" : "text-slate-400")}>{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
