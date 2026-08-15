import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { RewardRuleForm } from "./rule-form";
import { RedemptionTierForm } from "./tier-form";
import { toggleRewardRuleAction, toggleRedemptionTierAction } from "@/app/actions/rewards";

export default async function AdminRewardsPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    if (user.role !== "STAFF" || !(await can(user, "REWARDS_MANAGE_CONFIG"))) redirect("/dashboard");
  }

  const [rules, tiers] = await Promise.all([
    prisma.rewardRule.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.redemptionTier.findMany({ orderBy: { voucherValue: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reward Rules</h1>
            <p className="text-sm text-slate-500">Only one earn rule is active at a time; it&apos;s applied automatically when an order completes.</p>
          </div>
          <RewardRuleForm />
        </div>

        <Card className="mt-4">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Rate</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {rules.map((r) => {
                const toggle = toggleRewardRuleAction.bind(null, r.id);
                return (
                  <TR key={r.id}>
                    <TD className="font-medium text-slate-900">{r.name}</TD>
                    <TD>
                      {r.pointsPerCurrencyUnit.toString()} pt(s) per ₱{r.currencyUnit.toString()} spent
                    </TD>
                    <TD>
                      <Badge tone={r.active ? "green" : "slate"}>{r.active ? "Active" : "Inactive"}</Badge>
                    </TD>
                    <TD>
                      <form action={toggle}>
                        <Button type="submit" size="sm" variant="outline">
                          {r.active ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {rules.length === 0 && <EmptyState label="No reward rules yet." />}
        </Card>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Voucher Redemption Tiers</h2>
            <p className="text-sm text-slate-500">
              What customers can redeem their points for. Multiple tiers can be active at once (unlike the earn rule above).
            </p>
          </div>
          <RedemptionTierForm />
        </div>

        <Card className="mt-4">
          <Table>
            <THead>
              <TR>
                <TH>Points cost</TH>
                <TH>Voucher value</TH>
                <TH>Minimum order to use</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {tiers.map((t) => {
                const toggle = toggleRedemptionTierAction.bind(null, t.id);
                return (
                  <TR key={t.id}>
                    <TD>{t.pointsCost} pts</TD>
                    <TD className="font-medium text-slate-900">{formatCurrency(t.voucherValue)}</TD>
                    <TD>{formatCurrency(t.minimumSpend)}</TD>
                    <TD>
                      <Badge tone={t.active ? "green" : "slate"}>{t.active ? "Active" : "Inactive"}</Badge>
                    </TD>
                    <TD>
                      <form action={toggle}>
                        <Button type="submit" size="sm" variant="outline">
                          {t.active ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {tiers.length === 0 && <EmptyState label="No voucher tiers configured yet." />}
        </Card>
      </div>
    </div>
  );
}
