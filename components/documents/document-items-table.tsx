import { formatCurrency } from "@/lib/utils";

export type DocumentLineItem = {
  label: string;
  type?: string;
  qty: number;
  unitPrice: number;
  /** No discount concept exists anywhere in the schema (quotation totals are always exactly qty*unitPrice) — kept as an optional column so the table matches the expected business-document shape, but it will read "—" until a real discount feature exists to populate it. */
  discount?: number;
};

/**
 * Shared by the Quotation and Invoice documents. A plain semantic
 * <table>/<thead>/<tbody> — browsers already repeat <thead> on additional
 * printed pages and keep rows from splitting reasonably well without any
 * extra CSS, so this doesn't need print-specific markup beyond what's here.
 */
export function DocumentItemsTable({ items }: { items: DocumentLineItem[] }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-slate-300 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-2">Item</th>
            <th className="py-2 pr-2">Type</th>
            <th className="py-2 pr-2 text-right">Qty</th>
            <th className="py-2 pr-2 text-right">Price</th>
            <th className="py-2 pr-2 text-right">Discount</th>
            <th className="py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const lineTotal = item.qty * item.unitPrice - (item.discount ?? 0);
            return (
              <tr key={i} className="break-inside-avoid border-b border-slate-100 align-top">
                <td className="max-w-xs py-2 pr-2 break-words whitespace-pre-wrap">{item.label}</td>
                <td className="py-2 pr-2 whitespace-nowrap text-slate-600">{item.type ?? "—"}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{item.qty}</td>
                <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap">{formatCurrency(item.unitPrice)}</td>
                <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap">
                  {item.discount ? formatCurrency(item.discount) : "—"}
                </td>
                <td className="py-2 text-right font-medium tabular-nums whitespace-nowrap">{formatCurrency(lineTotal)}</td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-sm text-slate-400">
                No items.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
