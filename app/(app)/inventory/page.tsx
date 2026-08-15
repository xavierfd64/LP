import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { NewItemForm } from "./new-item-form";

export default async function InventoryPage() {
  await requireRole(["STAFF", "ADMIN", "PRODUCTION"]);

  const items = await prisma.inventoryItem.findMany({ orderBy: { name: "asc" } });
  const lowStock = items.filter((i) => i.currentQty <= i.reorderThreshold);

  const recentMovements = await prisma.inventoryMovement.findMany({
    where: { jobOrderId: { not: null } },
    include: { supplyLot: { include: { inventoryItem: true } }, jobOrder: true, createdBy: true },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">Stock levels, supply lots, and consumption.</p>
        </div>
        <NewItemForm />
      </div>

      {lowStock.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="py-3 text-sm text-yellow-900">
            <span className="font-semibold">Low stock: </span>
            {lowStock.map((i) => i.name).join(", ")}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>SKU</TH>
              <TH>Name</TH>
              <TH>Unit</TH>
              <TH>Current Qty</TH>
              <TH>Reorder Threshold</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {items.map((i) => (
              <TR key={i.id}>
                <TD className="font-mono text-xs">{i.sku}</TD>
                <TD className="font-medium text-slate-900">{i.name}</TD>
                <TD>{i.unit}</TD>
                <TD>
                  {i.currentQty}
                  {i.currentQty <= i.reorderThreshold && (
                    <Badge tone="yellow" className="ml-2">
                      Low
                    </Badge>
                  )}
                </TD>
                <TD>{i.reorderThreshold}</TD>
                <TD>
                  <Link href={`/inventory/${i.id}`} className="text-sm font-medium text-slate-900 underline">
                    Manage
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {items.length === 0 && <EmptyState label="No inventory items yet." />}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent consumption by Job Order</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Item</TH>
              <TH>JO</TH>
              <TH>Type</TH>
              <TH>Qty</TH>
              <TH>By</TH>
            </TR>
          </THead>
          <TBody>
            {recentMovements.map((m) => (
              <TR key={m.id}>
                <TD>{m.createdAt.toLocaleDateString()}</TD>
                <TD>{m.supplyLot.inventoryItem.name}</TD>
                <TD>
                  {m.jobOrder && (
                    <Link href={`/job-orders/${m.jobOrder.id}`} className="underline">
                      {m.jobOrder.joNumber}
                    </Link>
                  )}
                </TD>
                <TD>{m.type}</TD>
                <TD>{m.qty}</TD>
                <TD>{m.createdBy?.name}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {recentMovements.length === 0 && <EmptyState label="No job-order consumption recorded yet." />}
      </Card>
    </div>
  );
}
