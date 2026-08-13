import { requireRole } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { RedeemForm } from "./redeem-form";

export default async function CustomerRewardsPage() {
  const user = await requireRole(["CUSTOMER"]);
  const customer = await getCurrentCustomer(user.id);

  const transactions = await prisma.rewardTransaction.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    include: { order: true },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">My Rewards</h1>

      <Card>
        <CardContent className="flex items-center justify-between py-6">
          <div>
            <p className="text-sm text-slate-500">Points balance</p>
            <p className="text-3xl font-bold text-slate-900">{customer.rewardPointsBalance}</p>
          </div>
          <RedeemForm balance={customer.rewardPointsBalance} />
        </CardContent>
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
