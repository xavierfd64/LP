import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDate, formatCurrency } from "@/lib/utils";
import { TogglePromotionButton } from "./toggle-promotion-button";

export default async function PromotionsPage() {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "SERVICE_MANAGE"))) redirect("/dashboard");

  const promotions = await prisma.promotion.findMany({
    include: { service: true },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Promotions</h1>
          <p className="text-sm text-slate-500">
            Configurable promotional discounts (spec Part H) — applied automatically by the pricing engine for
            instant quotations, at most one per calculation.
          </p>
        </div>
        <Link href="/admin/promotions/new">
          <Button>+ New Promotion</Button>
        </Link>
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Applies To</TH>
              <TH>Window</TH>
              <TH>Qty Range</TH>
              <TH>Discount</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {promotions.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium text-slate-900">{p.name}</TD>
                <TD className="text-sm text-slate-600">{p.service?.name ?? "All services"}</TD>
                <TD className="text-sm text-slate-500">
                  {p.startDate || p.endDate
                    ? `${p.startDate ? formatDate(p.startDate) : "…"} – ${p.endDate ? formatDate(p.endDate) : "…"}`
                    : "Always"}
                </TD>
                <TD className="text-sm text-slate-500">
                  {p.minQty || p.maxQty ? `${p.minQty ?? "0"}${p.maxQty ? `–${p.maxQty}` : "+"}` : "Any"}
                </TD>
                <TD className="text-sm text-slate-600">
                  {p.percentDiscount != null ? `${p.percentDiscount}% off` : `${formatCurrency(p.fixedDiscount?.toString() ?? "0")} off`}
                </TD>
                <TD>
                  <Badge tone={p.active ? "green" : "slate"}>{p.active ? "Active" : "Inactive"}</Badge>
                </TD>
                <TD>
                  <TogglePromotionButton promotionId={p.id} active={p.active} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {promotions.length === 0 && <EmptyState label="No promotions configured yet." />}
      </Card>
    </div>
  );
}
