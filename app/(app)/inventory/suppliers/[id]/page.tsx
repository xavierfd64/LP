import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { SupplierFormModal } from "../supplier-form-modal";

/**
 * A supplier's real purchase history and totals, computed from actual
 * SupplyLot rows — never hard-coded (spec Part C item 14). Cancelled
 * purchases stay visible in the history (they happened) but are excluded
 * from the Total Purchases figure and clearly marked.
 */
export default async function SupplierDetailPage({ params }: PageProps<"/inventory/suppliers/[id]">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "SUPPLIER_VIEW"))) redirect("/dashboard");
  const canManage = user.role === "ADMIN" || (await can(user, "SUPPLIER_MANAGE"));

  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      purchases: {
        include: { inventoryItem: true },
        orderBy: { receivedDate: "desc" },
      },
    },
  });
  if (!supplier) notFound();

  const activePurchases = supplier.purchases.filter((p) => !p.cancelledAt);
  const costedPurchases = activePurchases.filter((p) => p.unitCost != null);
  const totalPurchases = costedPurchases.reduce((sum, p) => sum + Number(p.unitCost) * p.receivedQty, 0);
  const materials = Array.from(new Set(supplier.purchases.map((p) => p.inventoryItem.name)));

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{supplier.name}</h1>
          <Badge tone={supplier.active ? "green" : "slate"} className="mt-1">
            {supplier.active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory/suppliers">
            <Button variant="outline">Back to Suppliers</Button>
          </Link>
          {canManage && (
            <SupplierFormModal
              supplier={{
                id: supplier.id,
                name: supplier.name,
                contactPerson: supplier.contactPerson,
                phone: supplier.phone,
                email: supplier.email,
                address: supplier.address,
                taxId: supplier.taxId,
                paymentTerms: supplier.paymentTerms,
                notes: supplier.notes,
                active: supplier.active,
              }}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="px-5 py-4">
          <p className="text-xs uppercase text-slate-500">Total Purchases</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalPurchases)}</p>
          {costedPurchases.length < activePurchases.length && (
            <p className="mt-1 text-xs text-amber-600">
              {activePurchases.length - costedPurchases.length} purchase{activePurchases.length - costedPurchases.length === 1 ? "" : "s"} without a recorded cost, not included.
            </p>
          )}
        </Card>
        <Card className="px-5 py-4">
          <p className="text-xs uppercase text-slate-500">Purchase Records</p>
          <p className="text-2xl font-bold text-slate-900">{supplier.purchases.length}</p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-xs uppercase text-slate-500">Materials Supplied</p>
          <p className="text-sm font-medium text-slate-900">{materials.length > 0 ? materials.join(", ") : "—"}</p>
        </Card>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 py-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-slate-500">Contact Person</p>
            <p className="text-slate-900">{supplier.contactPerson || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Phone</p>
            <p className="text-slate-900">{supplier.phone || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Email</p>
            <p className="text-slate-900">{supplier.email || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Payment Terms</p>
            <p className="text-slate-900">{supplier.paymentTerms || "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs uppercase text-slate-500">Address</p>
            <p className="text-slate-900">{supplier.address || "—"}</p>
          </div>
          {supplier.taxId && (
            <div>
              <p className="text-xs uppercase text-slate-500">Tax / VAT ID</p>
              <p className="text-slate-900">{supplier.taxId}</p>
            </div>
          )}
          {supplier.notes && (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase text-slate-500">Notes</p>
              <p className="text-slate-900">{supplier.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-x-auto">
        <div className="px-4 pt-4">
          <h2 className="text-sm font-semibold text-slate-900">Purchase History</h2>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Material</TH>
              <TH>Qty</TH>
              <TH>Unit Cost</TH>
              <TH>Total</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {supplier.purchases.map((p) => (
              <TR key={p.id} className={p.cancelledAt ? "opacity-60" : ""}>
                <TD className="text-sm text-slate-500">{formatDate(p.receivedDate)}</TD>
                <TD>
                  <Link href={`/inventory/${p.inventoryItemId}`} className="font-medium text-slate-900 underline">
                    {p.inventoryItem.name}
                  </Link>
                </TD>
                <TD className="text-sm text-slate-700">
                  {p.receivedQty} {p.inventoryItem.unit}
                </TD>
                <TD className="text-sm text-slate-700">{p.unitCost != null ? formatCurrency(p.unitCost.toString()) : "—"}</TD>
                <TD className="font-medium text-slate-900">
                  {p.unitCost != null ? formatCurrency(Number(p.unitCost) * p.receivedQty) : "—"}
                </TD>
                <TD>
                  {p.cancelledAt ? <Badge tone="red">Cancelled</Badge> : <Badge tone="green">Recorded</Badge>}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {supplier.purchases.length === 0 && <EmptyState label="No purchases recorded from this supplier yet." />}
      </Card>
    </div>
  );
}
