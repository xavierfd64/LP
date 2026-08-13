"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { logAudit } from "@/lib/audit";

const ruleSchema = z.object({
  name: z.string().min(1),
  pointsPerCurrencyUnit: z.coerce.number().positive(),
  currencyUnit: z.coerce.number().positive(),
});

export async function createRewardRuleAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);

  const parsed = ruleSchema.safeParse({
    name: formData.get("name"),
    pointsPerCurrencyUnit: formData.get("pointsPerCurrencyUnit"),
    currencyUnit: formData.get("currencyUnit"),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const rule = await prisma.rewardRule.create({ data: { ...parsed.data, active: false } });
  await logAudit(user.id, "REWARD_RULE_CREATED", "RewardRule", rule.id, parsed.data);

  redirect(`/admin/rewards`);
}

export async function toggleRewardRuleAction(ruleId: string) {
  const user = await requireRole(["ADMIN"]);
  const rule = await prisma.rewardRule.findUniqueOrThrow({ where: { id: ruleId } });

  if (!rule.active) {
    // Activating this rule deactivates every other rule (single active rule at a time).
    await prisma.$transaction([
      prisma.rewardRule.updateMany({ data: { active: false }, where: {} }),
      prisma.rewardRule.update({ where: { id: ruleId }, data: { active: true } }),
    ]);
  } else {
    await prisma.rewardRule.update({ where: { id: ruleId }, data: { active: false } });
  }

  await logAudit(user.id, "REWARD_RULE_TOGGLED", "RewardRule", ruleId, { active: !rule.active });

  redirect(`/admin/rewards`);
}

const redeemSchema = z.object({
  points: z.coerce.number().int().positive(),
  description: z.string().min(1, "Describe what you're redeeming for."),
});

export async function redeemPointsAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");

  const parsed = redeemSchema.safeParse({
    points: formData.get("points"),
    description: formData.get("description"),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const customer = await getCurrentCustomer(user.id);
  if (parsed.data.points > customer.rewardPointsBalance) {
    return `You only have ${customer.rewardPointsBalance} points available.`;
  }

  await prisma.$transaction([
    prisma.rewardTransaction.create({
      data: {
        customerId: customer.id,
        points: -parsed.data.points,
        type: "REDEEM",
        description: parsed.data.description,
      },
    }),
    prisma.customer.update({
      where: { id: customer.id },
      data: { rewardPointsBalance: { decrement: parsed.data.points } },
    }),
  ]);

  await logAudit(user.id, "REWARD_POINTS_REDEEMED", "Customer", customer.id, {
    points: parsed.data.points,
    description: parsed.data.description,
  });

  redirect(`/account/rewards`);
}
