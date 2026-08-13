import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ReceiveLotForm } from "./receive-lot-form";
import { MovementForm } from "./movement-form";

export default async function InventoryItemPage({ params }: PageProps<"/inventory/[itemId]">) {
  await requireRole(["STAFF", "ADMIN", "PRODUCTION"]);
  const { itemId } = await params;

  const item = await prisma.inventoryItem.findUnique({
    where: { id: itemId },
    include: {
      supplyLots: {
        orderBy: { receivedDate: "desc" },
        include: { movements: { orderBy: { createdAt: "desc" }, include: { jobOrder: true, createdBy: true } } },
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

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Supply lots</CardTitle>
          <ReceiveLotForm itemId={item.id} />
        </CardHeader>
        <CardContent className="space-y-4">
          {item.supplyLots.map((lot) => (
            <div key={lot.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-900">{lot.lotCode}</p>
                  <p className="text-xs text-slate-500">
                    Received {formatDate(lot.receivedDate)}
                    {lot.supplier ? ` from ${lot.supplier}` : ""} · {lot.receivedQty} {item.unit} received
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-slate-900">
                    {lot.remainingQty} <span className="text-xs font-normal text-slate-500">remaining</span>
                  </p>
                  <MovementForm lotId={lot.id} remainingQty={lot.remainingQty} jobOrders={jobOrderOpts} />
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
          ))}
          {item.supplyLots.length === 0 && <EmptyState label="No supply lots received yet." />}
        </CardContent>
      </Card>
    </div>
  );
}
