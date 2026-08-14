import { requireRole } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { RedeemForm } from "./redeem-form";

export default async function CustomerRewardsPage() {
  const user = await requireRole(["CUSTOMER"]);
  const customer = await getCurrentCustomer(user.id);

  const [transactions, tiers, vouchers] = await Promise.all([
    prisma.rewardTransaction.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      include: { order: true },
    }),
    prisma.redemptionTier.findMany({ where: { active: true }, orderBy: { voucherValue: "asc" } }),
    prisma.voucher.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">My Rewards</h1>

      <Card>
        <CardContent className="flex items-center justify-between py-6">
          <div>
            <p className="text-sm text-slate-500">Points balance</p>
            <p className="text-3xl font-bold text-slate-900">{customer.rewardPointsBalance}</p>
          </div>
          <RedeemForm
            balance={customer.rewardPointsBalance}
            tiers={tiers.map((t) => ({
              id: t.id,
              pointsCost: t.pointsCost,
              voucherValue: t.voucherValue,
              minimumSpend: t.minimumSpend,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My vouchers</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Value</TH>
              <TH>Min. order</TH>
              <TH>Status</TH>
              <TH>Issued</TH>
            </TR>
          </THead>
          <TBody>
            {vouchers.map((v) => (
              <TR key={v.id}>
                <TD className="font-mono text-xs">{v.code}</TD>
                <TD className="font-medium text-slate-900">{formatCurrency(v.value)}</TD>
                <TD>{formatCurrency(v.minimumSpend)}</TD>
                <TD>
                  <Badge tone={v.status === "AVAILABLE" ? "green" : "slate"}>{v.status}</Badge>
                </TD>
                <TD>{formatDateTime(v.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {vouchers.length === 0 && <EmptyState label="No vouchers yet — redeem points to get one." />}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Type</TH>
              <TH>Points</TH>
              <TH>Description</TH>
            </TR>
          </THead>
          <TBody>
            {transactions.map((t) => (
              <TR key={t.id}>
                <TD>{formatDateTime(t.createdAt)}</TD>
                <TD>
                  <Badge tone={t.type === "EARN" ? "green" : "slate"}>{t.type}</Badge>
                </TD>
                <TD className={t.points >= 0 ? "text-green-700" : "text-red-700"}>
                  {t.points >= 0 ? `+${t.points}` : t.points}
                </TD>
                <TD>{t.description ?? (t.order ? `Order ${t.order.orderNumber}` : "—")}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {transactions.length === 0 && <EmptyState label="No reward activity yet." />}
      </Card>
    </div>
  );
}
