import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifyCustomer } from "@/lib/notifications";

/** Auto-earn reward points when an Order is fully completed (all JOs fulfilled). */
export async function onOrderCompleted(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const rule = await prisma.rewardRule.findFirst({ where: { active: true } });
  if (!rule) return;

  const points = Math.floor(
    (Number(order.totalAmount) / Number(rule.currencyUnit)) * Number(rule.pointsPerCurrencyUnit)
  );
  if (points <= 0) return;

  await prisma.rewardTransaction.create({
    data: {
      customerId: order.customerId,
      orderId,
      points,
      type: "EARN",
      description: `Order ${order.orderNumber} completed`,
    },
  });
  await prisma.customer.update({
    where: { id: order.customerId },
    data: { rewardPointsBalance: { increment: points } },
  });

  await logAudit(null, "REWARD_POINTS_EARNED", "Order", orderId, { points, ruleId: rule.id });
  await notifyCustomer(
    order.customerId,
    "REWARD_POINTS_EARNED",
    `You earned ${points} reward points from order ${order.orderNumber}.`,
    `/account/rewards`
  );
}
