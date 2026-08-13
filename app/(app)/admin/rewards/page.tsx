import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { RewardRuleForm } from "./rule-form";
import { toggleRewardRuleAction } from "@/app/actions/rewards";

export default async function AdminRewardsPage() {
  await requireRole(["ADMIN"]);

  const rules = await prisma.rewardRule.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reward Rules</h1>
          <p className="text-sm text-slate-500">Only one rule is active at a time; it&apos;s applied automatically when an order completes.</p>
        </div>
        <RewardRuleForm />
      </div>

      <Card>
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
  );
}
