import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { SupplierFormModal } from "./supplier-form-modal";

/**
 * Supplier directory (Aug 20 3rd update, Part C) — a proper entity
 * instead of the free-text names purchases used before. Admin and Staff
 * granted SUPPLIER_VIEW/SUPPLIER_MANAGE only; Customer and Production
 * never reach this route at all (not in STAFF_NAV_RULES, requireUser
 * below redirects everyone else).
 */
export default async function SuppliersPage({ searchParams }: PageProps<"/inventory/suppliers">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "SUPPLIER_VIEW"))) redirect("/dashboard");
  const canManage = user.role === "ADMIN" || (await can(user, "SUPPLIER_MANAGE"));

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";

  const suppliers = await prisma.supplier.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { contactPerson: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: {
      purchases: { where: { cancelledAt: null }, select: { inventoryItem: { select: { name: true } } } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-sm text-slate-500">Vendors that supply materials, and what they've provided.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory">
            <Button variant="outline">Back to Inventory</Button>
          </Link>
          {canManage && <SupplierFormModal />}
        </div>
      </div>

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="q">Search suppliers</Label>
            <Input id="q" name="q" defaultValue={q} placeholder="Name, contact person, phone…" />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
          {q && (
            <Link href="/inventory/suppliers">
              <Button type="button" variant="ghost">
                Clear
              </Button>
            </Link>
          )}
        </form>
      </Card>

      {/* Desktop/tablet table */}
      <Card className="hidden overflow-x-auto sm:block">
        <Table>
          <THead>
            <TR>
              <TH>Supplier</TH>
              <TH>Contact</TH>
              <TH>Materials</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {suppliers.map((s) => {
              const materials = Array.from(new Set(s.purchases.map((p) => p.inventoryItem.name)));
              return (
                <TR key={s.id}>
                  <TD className="font-medium text-slate-900">{s.name}</TD>
                  <TD className="text-sm text-slate-600">
                    {s.contactPerson || "—"}
                    {s.phone && <span className="block text-xs text-slate-400">{s.phone}</span>}
                  </TD>
                  <TD className="text-sm text-slate-500">{materials.length > 0 ? materials.join(", ") : "—"}</TD>
                  <TD>
                    <Badge tone={s.active ? "green" : "slate"}>{s.active ? "Active" : "Inactive"}</Badge>
                  </TD>
                  <TD>
                    <Link href={`/inventory/suppliers/${s.id}`} className="text-sm font-medium text-brand-600 underline">
                      View
                    </Link>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {suppliers.length === 0 && <EmptyState label="No suppliers yet." />}
      </Card>

      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {suppliers.length === 0 && (
          <Card className="p-4">
            <EmptyState label="No suppliers yet." />
          </Card>
        )}
        {suppliers.map((s) => {
          const materials = Array.from(new Set(s.purchases.map((p) => p.inventoryItem.name)));
          return (
            <Card key={s.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-slate-900">{s.name}</span>
                <Badge tone={s.active ? "green" : "slate"}>{s.active ? "Active" : "Inactive"}</Badge>
              </div>
              {s.contactPerson && <p className="text-xs text-slate-500">{s.contactPerson}{s.phone ? ` · ${s.phone}` : ""}</p>}
              {materials.length > 0 && <p className="text-xs text-slate-400">Supplies: {materials.join(", ")}</p>}
              <Link href={`/inventory/suppliers/${s.id}`} className="block pt-1 text-sm font-medium text-brand-600 underline">
                View
              </Link>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
