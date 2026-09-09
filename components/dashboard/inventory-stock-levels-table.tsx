import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { StockLevelRow } from "@/lib/dashboard-data";

/**
 * "Inventory Stock Levels" table (Whiskey dashboard reference) — the 5
 * real items closest to their reorder threshold. No fabricated
 * "Category" column: InventoryItem has no category field in the schema,
 * so SKU (a real, distinguishing field) is shown instead rather than
 * inventing a categorization that doesn't exist as data.
 */
export function InventoryStockLevelsTable({ items, viewAllHref }: { items: StockLevelRow[]; viewAllHref: string }) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Inventory Stock Levels" subtitle="Top 5 items closest to reorder threshold" actionLabel="View All" actionHref={viewAllHref} />
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <EmptyState label="No inventory items yet." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="w-8">#</TH>
                <TH>Item</TH>
                <TH>SKU</TH>
                <TH className="text-right">Current Stock</TH>
                <TH className="text-right">Reorder Level</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item, i) => (
                <TR key={item.id}>
                  <TD className="text-slate-400">{i + 1}</TD>
                  <TD className="font-medium text-slate-900">{item.name}</TD>
                  <TD className="text-xs text-slate-500">{item.sku}</TD>
                  <TD className="text-right">
                    {item.currentQty} {item.unit}
                  </TD>
                  <TD className="text-right text-slate-500">
                    {item.reorderThreshold} {item.unit}
                  </TD>
                  <TD>{item.low ? <Badge tone="red">Low</Badge> : <Badge tone="green">OK</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
