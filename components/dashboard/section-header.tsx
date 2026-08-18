import Link from "next/link";

/** Consistent section title + optional "View all"-style link, reused across every dashboard card (spec item 35). */
export function SectionHeader({ title, actionLabel, actionHref }: { title: string; actionLabel?: string; actionHref?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="text-xs font-medium text-brand-600 hover:text-brand-700">
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}
