import { prisma } from "@/lib/prisma";

export async function getCurrentCustomer(userId: string) {
  return prisma.customer.findUniqueOrThrow({ where: { userId } });
}
