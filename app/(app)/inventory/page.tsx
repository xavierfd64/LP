import Link from "next/link";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { computeInventoryValueSummary, computePurchasesTotal } from "@/lib/inventory-cost";
import { resolvePeriodRange } from "@/lib/transaction-summary";
import { NewItemForm } from "./new-item-form";

export default async function InventoryPage() {
  const user = await requireRole(["STAFF", "ADMIN", "PRODUCTION"]);
  const canViewCost = user.role === "ADMIN" || (user.role === "STAFF" && (await can(user, "INVENTORY_COST_VIEW")));
  const canViewSuppliers = user.role === "ADMIN" || (user.role === "STAFF" && (await can(user, "SUPPLIER_VIEW")));

  const items = await prisma.inventoryItem.findMany({ orderBy: { name: "asc" } });
  const lowStock = items.filter((i) => i.currentQty <= i.reorderThreshold);

  const monthRange = resolvePeriodRange({ type: "monthly" });
  const [recentMovements, inventoryValue, purchasesThisMonth] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { jobOrderId: { not: null } },
      include: { supplyLot: { include: { inventoryItem: true } }, jobOrder: true, createdBy: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    canViewCost ? computeInventoryValueSummary() : Promise.resolve(null),
    canViewCost ? computePurchasesTotal(monthRange.start, monthRange.end) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">Stock levels, supply lots, and consumption.</p>
        </div>
        <div className="flex gap-2">
          {canViewSuppliers && (
            <Link href="/inventory/suppliers">
              <Button variant="outline">Suppliers</Button>
            </Link>
          )}
          <NewItemForm />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="px-5 py-4">
          <p className="text-xs uppercase text-slate-500">Total Inventory Items</p>
          <p className="text-2xl font-bold text-slate-900">{items.length}</p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-xs uppercase text-slate-500">Low Stock</p>
          <p className="text-2xl font-bold text-slate-900">{lowStock.length}</p>
        </Card>
        {canViewCost && inventoryValue && (
          <>
            <Card className="px-5 py-4">
              <p className="text-xs uppercase text-slate-500">Inventory Value</p>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(inventoryValue.totalValue)}</p>
              {inventoryValue.itemsWithoutCost > 0 && (
                <p className="mt-1 text-xs text-amber-600">{inventoryValue.itemsWithoutCost} item{inventoryValue.itemsWithoutCost === 1 ? "" : "s"} without cost, not included.</p>
              )}
            </Card>
            <Card className="px-5 py-4">
              <p className="text-xs uppercase text-slate-500">Purchases This Month</p>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(purchasesThisMonth ?? 0)}</p>
            </Card>
          </>
        )}
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
