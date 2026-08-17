import { prisma } from "@/lib/prisma";
import { nextCustomerDisplayId } from "@/lib/numbering";

/**
 * Links a brand-new User account to any existing login-free Customer
 * record with a matching email (created earlier by Admin/Staff via the
 * Customer Records "+" quick-add), instead of creating a duplicate —
 * preserving the existing Customer ID and every Quotation/Order/Job
 * Order/Payment/SOA/Reward already tied to it. Falls back to creating a
 * brand-new Customer when no such record exists. Shared by normal
 * email/password registration and OAuth sign-up so both paths behave the
 * same way.
 */
export async function linkOrCreateCustomerForUser(
  userId: string,
  info: { name: string; email: string; companyName?: string; phone?: string }
) {
  const existingCustomer = await prisma.customer.findFirst({
    where: { email: { equals: info.email, mode: "insensitive" }, userId: null },
  });

  if (existingCustomer) {
    return prisma.customer.update({ where: { id: existingCustomer.id }, data: { userId } });
  }

  const displayId = await nextCustomerDisplayId();
  return prisma.customer.create({
    data: {
      displayId,
      userId,
      name: info.name,
      companyName: info.companyName || undefined,
      email: info.email,
      contactNumber: info.phone || undefined,
    },
  });
}
