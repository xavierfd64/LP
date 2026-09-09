import { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<string, string> = {
  purple: "bg-purple-600",
  blue: "bg-blue-600",
  green: "bg-green-600",
  orange: "bg-orange-500",
};

/**
 * Numbered section card shared by the New Inquiry/Quotation/Order forms
 * (Aug 22 3rd update; extended Sept 9 — Unified Modal Design System) so
 * every large transaction form "feels like one system" — a colored
 * circle + step number, a title, and an optional short description ahead
 * of the section content, matching the New Quotation/New Order reference
 * illustrations exactly (those show every circle in the SAME blue, plus
 * a one-line helper sentence under each title — `tone` defaults to
 * "blue" now for that reason; the other tones remain available for a
 * caller with a deliberate reason to differ, but new callers should just
 * use the default). `action` renders a section-header-right slot (e.g.
 * "+ Add New Customer") for forms that need one.
 */
export function FormSectionCard({
  number,
  title,
  description,
  tone = "blue",
  action,
  children,
  className,
}: {
  number: number;
  title: string;
  description?: string;
  tone?: "purple" | "blue" | "green" | "orange";
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
              TONE_CLASSES[tone]
            )}
          >
            {number}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
