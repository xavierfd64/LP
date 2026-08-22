import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

export type ViewLineItem = {
  id: string;
  productType: string;
  description: string;
  qty: number;
  unit?: string | null;
  unitPrice: number | string;
};

/**
 * Read-only line items — a real `<table>` on desktop/tablet, stacked cards
 * on mobile (spec item 9: "convert wide tables into responsive line-item
 * cards", never just a shrunken table). Used by the Quotation/Order/Job
 * Order detail views; the editable LineItemsEditor (quotations/
 * line-items-editor.tsx) already avoids a `<table>` entirely and stays
 * unchanged.
 */
export function LineItemsView({ items }: { items: ViewLineItem[] }) {
  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <THead>
            <TR>
              <TH>Product</TH>
              <TH>Description</TH>
              <TH>Qty</TH>
              <TH>Unit</TH>
              <TH>Unit price</TH>
              <TH>Amount</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((li) => (
              <TR key={li.id}>
                <TD>{li.productType}</TD>
                <TD>{li.description}</TD>
                <TD>{li.qty}</TD>
                <TD>{li.unit || "—"}</TD>
                <TD>{formatCurrency(li.unitPrice)}</TD>
                <TD className="font-medium text-slate-900">{formatCurrency(Number(li.unitPrice) * li.qty)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <div className="space-y-3 sm:hidden">
        {items.map((li) => (
          <div key={li.id} className="rounded-lg border border-slate-200 p-3">
            <p className="font-medium text-slate-900">{li.productType}</p>
            {li.description && <p className="mt-0.5 text-sm text-slate-600">{li.description}</p>}
            <div className="mt-2 grid grid-cols-4 gap-2 text-sm">
              <div>
                <p className="text-xs text-slate-400">Qty</p>
                <p className="text-slate-900">
                  {li.qty}
                  {li.unit ? ` ${li.unit}` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Rate</p>
                <p className="text-slate-900">{formatCurrency(li.unitPrice)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-slate-400">Amount</p>
                <p className="font-semibold text-slate-900">{formatCurrency(Number(li.unitPrice) * li.qty)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
