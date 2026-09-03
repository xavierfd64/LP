import { cn, formatCurrency } from "@/lib/utils";

export function DocumentTotals({
  subtotal,
  discount,
  /** e.g. "Discount (10%)" for a percentage discount, or plain "Discount" for a fixed peso amount — see lib/pricing-totals.ts's discountLabel. Falls back to a plain "Discount" label if omitted, matching the prior behavior. */
  discountLabel,
  rows,
  grandTotalLabel = "Grand Total",
  grandTotal,
}: {
  subtotal: number;
  discount?: number;
  discountLabel?: string | null;
  /** Extra rows between the discount line and the grand total — e.g. an Invoice's Amount Paid / Outstanding Balance. */
  rows?: { label: string; value: string; emphasize?: boolean }[];
  grandTotalLabel?: string;
  grandTotal: number;
}) {
  return (
    <div className="ml-auto w-full max-w-xs space-y-1 break-inside-avoid">
      <div className="flex justify-between text-sm text-slate-600">
        <span>Subtotal</span>
        <span className="tabular-nums">{formatCurrency(subtotal)}</span>
      </div>
      {Boolean(discount) && (
        <div className="flex justify-between text-sm text-slate-600">
          <span>{discountLabel || "Discount"}</span>
          <span className="tabular-nums">-{formatCurrency(discount!)}</span>
        </div>
      )}
      {rows?.map((r) => (
        <div
          key={r.label}
          className={cn("flex justify-between text-sm", r.emphasize ? "font-semibold text-slate-900" : "text-slate-600")}
        >
          <span>{r.label}</span>
          <span className="tabular-nums">{r.value}</span>
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t-2 border-brand-600 pt-2 text-base font-bold text-brand-700">
        <span>{grandTotalLabel}</span>
        <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
      </div>
    </div>
  );
}
