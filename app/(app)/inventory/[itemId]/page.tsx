import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { computeItemCostBasis } from "@/lib/inventory-cost";
import { PurchaseForm } from "./purchase-form";
import { CancelPurchaseButton } from "./cancel-purchase-button";
import { MovementForm } from "./movement-form";

export default async function InventoryItemPage({ params }: PageProps<"/inventory/[itemId]">) {
  const user = await requireRole(["STAFF", "ADMIN", "PRODUCTION"]);
  const canViewCost = user.role === "ADMIN" || (user.role === "STAFF" && (await can(user, "INVENTORY_COST_VIEW")));
  const canPurchase = user.role === "ADMIN" || (user.role === "STAFF" && (await can(user, "PURCHASE_MANAGE")));

  const { itemId } = await params;

  const item = await prisma.inventoryItem.findUnique({
    where: { id: itemId },
    include: {
      supplyLots: {
        orderBy: { receivedDate: "desc" },
        include: {
          supplier: true,
          movements: { orderBy: { createdAt: "desc" }, include: { jobOrder: true, createdBy: true } },
        },
      },
    },
  });
  if (!item) notFound();

  const jobOrders = await prisma.jobOrder.findMany({
    where: { status: { in: ["ON_HOLD", "IN_PROGRESS", "QC", "REWORK"] } },
    include: { order: true },
    orderBy: { joNumber: "asc" },
  });
  const jobOrderOpts = jobOrders.map((jo) => ({ id: jo.id, joNumber: jo.joNumber, orderNumber: jo.order.orderNumber }));

  const [costBasis, activeSuppliers] = await Promise.all([
    computeItemCostBasis(item.id),
    canPurchase ? prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const inventoryValue = costBasis.averageUnitCost != null ? item.currentQty * costBasis.averageUnitCost : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{item.name}</h1>
          <p className="text-sm font-mono text-slate-500">{item.sku}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900">
            {item.currentQty} <span className="text-sm font-normal text-slate-500">{item.unit}</span>
          </p>
          {item.currentQty <= item.reorderThreshold && <Badge tone="yellow">Below reorder threshold ({item.reorderThreshold})</Badge>}
        </div>
      </div>

      {canViewCost && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="px-5 py-4">
            <p className="text-xs uppercase text-slate-500">Average Unit Cost</p>
            <p className="text-2xl font-bold text-slate-900">
              {costBasis.averageUnitCost != null ? `${formatCurrency(costBasis.averageUnitCost)} / ${item.unit}` : "Cost not configured"}
            </p>
            {costBasis.configuredLotCount > 0 && costBasis.configuredLotCount < costBasis.totalLotCount && (
              <p className="mt-1 text-xs text-amber-600">
                Based on {costBasis.configuredLotCount} of {costBasis.totalLotCount} purchases with a recorded cost.
              </p>
            )}
          </Card>
          <Card className="px-5 py-4">
            <p className="text-xs uppercase text-slate-500">Inventory Value</p>
            <p className="text-2xl font-bold text-slate-900">{inventoryValue != null ? formatCurrency(inventoryValue) : "Cost not configured"}</p>
            <p className="mt-1 text-xs text-slate-400">
              {item.currentQty} {item.unit} × average cost — moving-average basis, not FIFO/LIFO.
            </p>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Purchase History</CardTitle>
          {canPurchase && <PurchaseForm itemId={item.id} unit={item.unit} suppliers={activeSuppliers.map((s) => ({ id: s.id, name: s.name }))} />}
        </CardHeader>
        <CardContent className="space-y-4">
          {item.supplyLots.map((lot) => {
            const supplierLabel = lot.supplier?.name ?? lot.supplierName;
            const canCancel = canPurchase && !lot.cancelledAt && lot.remainingQty === lot.receivedQty;
            const total = lot.unitCost != null ? Number(lot.unitCost) * lot.receivedQty : null;
            return (
              <div key={lot.id} className={`rounded-md border border-slate-200 p-3 ${lot.cancelledAt ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-slate-900">
                      {lot.lotCode} {lot.cancelledAt && <Badge tone="red" className="ml-2">Cancelled</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      Received {formatDate(lot.receivedDate)}
                      {supplierLabel ? ` from ${supplierLabel}` : ""} · {lot.receivedQty} {item.unit} received
                      {lot.invoiceNumber ? ` · Invoice ${lot.invoiceNumber}` : ""}
                    </p>
                    {canViewCost && (
                      <p className="text-xs text-slate-500">
                        {lot.unitCost != null ? (
                          <>
                            {formatCurrency(lot.unitCost.toString())} / {item.unit} · Total {formatCurrency(total ?? 0)}
                          </>
                        ) : (
                          "Cost not configured"
                        )}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-slate-900">
                      {lot.remainingQty} <span className="text-xs font-normal text-slate-500">remaining</span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                      {!lot.cancelledAt && <MovementForm lotId={lot.id} remainingQty={lot.remainingQty} jobOrders={jobOrderOpts} />}
                      {canCancel && <CancelPurchaseButton lotId={lot.id} lotCode={lot.lotCode} />}
                    </div>
                  </div>
                </div>
                {lot.movements.length > 0 && (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Date</TH>
                        <TH>Type</TH>
                        <TH>Qty</TH>
                        <TH>Job Order</TH>
                        <TH>By</TH>
                        <TH>Notes</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {lot.movements.map((m) => (
                        <TR key={m.id}>
                          <TD>{formatDateTime(m.createdAt)}</TD>
                          <TD>{m.type}</TD>
                          <TD>{m.qty > 0 ? `+${m.qty}` : m.qty}</TD>
                          <TD>{m.jobOrder?.joNumber ?? "—"}</TD>
                          <TD>{m.createdBy.name}</TD>
                          <TD>{m.notes ?? "—"}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </div>
            );
          })}
          {item.supplyLots.length === 0 && <EmptyState label="No purchases recorded yet." />}
        </CardContent>
      </Card>
    </div>
  );
}
