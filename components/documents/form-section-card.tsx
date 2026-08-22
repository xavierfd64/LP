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
 * (Aug 22 3rd update) so the three forms "feel like one system" — a small
 * colored circle + step number ahead of the section title, matching the
 * AI UI illustration. Purely a visual wrapper around the same card shell
 * EditorPanel already uses elsewhere.
 */
export function FormSectionCard({
  number,
  title,
  tone = "purple",
  children,
  className,
}: {
  number: number;
  title: string;
  tone?: "purple" | "blue" | "green" | "orange";
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
            TONE_CLASSES[tone]
          )}
        >
          {number}
        </span>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
      </div>
      {children}
    </section>
  );
}
