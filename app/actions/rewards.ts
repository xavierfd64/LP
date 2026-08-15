"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { logAudit } from "@/lib/audit";
import { nextVoucherCode } from "@/lib/numbering";
import { notifyCustomer } from "@/lib/notifications";

const ruleSchema = z.object({
  name: z.string().min(1),
  pointsPerCurrencyUnit: z.coerce.number().positive(),
  currencyUnit: z.coerce.number().positive(),
});

export async function createRewardRuleAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("REWARDS_MANAGE_CONFIG");

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
  const user = await requirePermission("REWARDS_MANAGE_CONFIG");
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

const tierSchema = z.object({
  pointsCost: z.coerce.number().int().positive(),
  voucherValue: z.coerce.number().int().positive(),
  minimumSpend: z.coerce.number().int().positive(),
});

/** Admin-configurable redemption tiers (points cost -> voucher value -> minimum order to use it). Multiple tiers can be active at once, unlike the single-active RewardRule. */
export async function createRedemptionTierAction(_prevState: string | undefined, formData: FormData) {
  const user = await requirePermission("REWARDS_MANAGE_CONFIG");

  const parsed = tierSchema.safeParse({
    pointsCost: formData.get("pointsCost"),
    voucherValue: formData.get("voucherValue"),
    minimumSpend: formData.get("minimumSpend"),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const tier = await prisma.redemptionTier.create({ data: { ...parsed.data, active: true } });
  await logAudit(user.id, "REDEMPTION_TIER_CREATED", "RedemptionTier", tier.id, parsed.data);

  redirect(`/admin/rewards`);
}

export async function toggleRedemptionTierAction(tierId: string) {
  const user = await requirePermission("REWARDS_MANAGE_CONFIG");
  const tier = await prisma.redemptionTier.findUniqueOrThrow({ where: { id: tierId } });

  await prisma.redemptionTier.update({ where: { id: tierId }, data: { active: !tier.active } });
  await logAudit(user.id, "REDEMPTION_TIER_TOGGLED", "RedemptionTier", tierId, { active: !tier.active });

  redirect(`/admin/rewards`);
}

const redeemSchema = z.object({
  tierId: z.string().min(1),
});

/** Customer redeems points for a voucher at a fixed admin-configured tier — this is the only way points leave the balance now (no more free-text redemption). */
export async function redeemPointsAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") throw new Error("Not allowed.");

  const parsed = redeemSchema.safeParse({ tierId: formData.get("tierId") });
  if (!parsed.success) return "Please choose a voucher to redeem.";

  const customer = await getCurrentCustomer(user.id);
  const tier = await prisma.redemptionTier.findUniqueOrThrow({ where: { id: parsed.data.tierId } });
  if (!tier.active) return "This voucher tier is no longer available.";
  if (tier.pointsCost > customer.rewardPointsBalance) {
    return `You only have ${customer.rewardPointsBalance} points available.`;
  }

  const code = await nextVoucherCode();

  await prisma.$transaction(async (tx) => {
    const txn = await tx.rewardTransaction.create({
      data: {
        customerId: customer.id,
        points: -tier.pointsCost,
        type: "REDEEM",
        description: `Redeemed for a ${tier.voucherValue} voucher (${code})`,
      },
    });
    await tx.customer.update({
      where: { id: customer.id },
      data: { rewardPointsBalance: { decrement: tier.pointsCost } },
    });
    await tx.voucher.create({
      data: {
        code,
        customerId: customer.id,
        tierId: tier.id,
        value: tier.voucherValue,
        minimumSpend: tier.minimumSpend,
        rewardTransactionId: txn.id,
      },
    });
  });

  await logAudit(user.id, "REWARD_POINTS_REDEEMED", "Customer", customer.id, {
    pointsCost: tier.pointsCost,
    voucherValue: tier.voucherValue,
    code,
  });
  await notifyCustomer(
    customer.id,
    "VOUCHER_REDEEMED",
    `You redeemed ${tier.pointsCost} points for a ${tier.voucherValue} voucher (${code}).`,
    `/account/rewards`
  );

  redirect(`/account/rewards`);
}
