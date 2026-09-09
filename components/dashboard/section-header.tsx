import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Consistent section title + optional "View all"-style link, reused
 * across every dashboard card (spec item 35). `subtitle` (a one-line
 * description under the title, e.g. "Top 5 items with lowest stock") and
 * `filter` (a right-aligned slot, e.g. a "This Month" period control) are
 * the two additions the Whiskey dashboard reference's chart cards need —
 * added here rather than as a second header component so every card
 * keeps reading from the one shared header.
 */
export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  actionHref,
  filter,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionHref?: string;
  filter?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {filter}
      {actionLabel && actionHref && (
        <Link href={actionHref} className="text-xs font-medium text-brand-600 hover:text-brand-700">
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}
