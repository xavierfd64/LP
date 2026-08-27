"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { can, requirePermission } from "@/lib/permissions-guard";
import { nextCustomerDisplayId } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";

export type CustomerSearchResult = {
  id: string;
  displayId: string;
  name: string;
  companyName: string | null;
  email: string | null;
  contactNumber: string | null;
  hasLogin: boolean;
  isQualifiedForTerms: boolean;
};

/**
 * Smart multi-field customer search for transaction preparation (Quotation/
 * Order forms) — always returns Customer Name as the primary result no
 * matter which field matched. Searches Complete Name, Company Name, Email,
 * Contact Number, Facebook, and Customer ID directly on Customer, plus the
 * linked User's name/email as the closest analog to "Username" (this schema
 * has no separate username field — accounts log in with email). Never loads
 * the full customer list — empty query returns nothing, and results are
 * capped at 10.
 */
export async function searchCustomersForTransactionAction(query: string): Promise<CustomerSearchResult[]> {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) throw new Error("Not allowed.");
  if (user.role === "STAFF" && !(await can(user, "CUSTOMER_VIEW"))) {
    throw new Error("You do not have permission to search customers.");
  }

  const q = query.trim();
  if (!q) return [];

  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { displayId: { contains: q, mode: "insensitive" } },
        { companyName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { contactNumber: { contains: q, mode: "insensitive" } },
        { facebookUrl: { contains: q, mode: "insensitive" } },
        { user: { is: { name: { contains: q, mode: "insensitive" } } } },
        { user: { is: { email: { contains: q, mode: "insensitive" } } } },
      ],
    },
    take: 10,
    orderBy: { name: "asc" },
    include: { user: { select: { email: true } } },
  });

  return customers.map((c) => ({
    id: c.id,
    displayId: c.displayId,
    name: c.name,
    companyName: c.companyName,
    email: c.email ?? c.user?.email ?? null,
    contactNumber: c.contactNumber,
    hasLogin: !!c.userId,
    isQualifiedForTerms: c.isQualifiedForTerms,
  }));
}

const quickAddSchema = z.object({
  name: z.string().min(2, "Complete name is required."),
  address: z.string().optional(),
  contactNumber: z.string().optional(),
  email: z.union([z.string().email("Enter a valid email."), z.literal("")]).optional(),
  facebookUrl: z.string().optional(),
});

export type QuickAddCustomerResult =
  | { ok: true; customer: CustomerSearchResult }
  | { ok: false; error: string };

/**
 * "+" quick-add: creates a permanent, independent Customer Record with no
 * login/password fields — the record works immediately for transaction
 * preparation, and can optionally gain a login later via
 * activateCustomerLoginAction without ever being duplicated.
 */
export async function quickAddCustomerAction(formData: FormData): Promise<QuickAddCustomerResult> {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) return { ok: false, error: "Not allowed." };
  if (user.role === "STAFF" && !(await can(user, "CUSTOMER_CREATE"))) {
    return { ok: false, error: "You do not have permission to create customers." };
  }

  const parsed = quickAddSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address"),
    contactNumber: formData.get("contactNumber"),
    email: formData.get("email") ?? "",
    facebookUrl: formData.get("facebookUrl") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { name, address, contactNumber, email, facebookUrl } = parsed.data;
  const displayId = await nextCustomerDisplayId();

  const customer = await prisma.customer.create({
    data: {
      displayId,
      name,
      address: address || undefined,
      contactNumber: contactNumber || undefined,
      email: email || undefined,
      facebookUrl: facebookUrl || undefined,
    },
  });

  await logAudit(user.id, "CUSTOMER_CREATED", "Customer", customer.id, { name, displayId });

  return {
    ok: true,
    customer: {
      id: customer.id,
      displayId: customer.displayId,
      name: customer.name,
      companyName: customer.companyName,
      email: customer.email,
      contactNumber: customer.contactNumber,
      hasLogin: false,
      isQualifiedForTerms: false,
    },
  };
}

const activateLoginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

/**
 * Attaches a brand-new User (login account) to an EXISTING Customer record
 * — never creates a second Customer row. All prior transactions stay linked
 * because they reference the same Customer.id throughout.
 */
export async function activateCustomerLoginAction(
  customerId: string,
  _prevState: string | undefined,
  formData: FormData
) {
  const user = await requirePermission("CUSTOMER_EDIT");

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (customer.userId) return "This customer already has a login account.";

  const parsed = activateLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existingUser) return "An account with that email already exists.";

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        name: customer.name,
        email: parsed.data.email,
        passwordHash,
        role: "CUSTOMER",
        phone: customer.contactNumber ?? undefined,
      },
    });
    await tx.customer.update({
      where: { id: customerId },
      data: { userId: newUser.id, email: customer.email ?? parsed.data.email },
    });
  });

  await logAudit(user.id, "CUSTOMER_LOGIN_ACTIVATED", "Customer", customerId, { email: parsed.data.email });
  redirect(`/customers/${customerId}`);
}

const editCustomerSchema = z.object({
  name: z.string().min(2, "Complete name is required."),
  companyName: z.string().optional(),
  address: z.string().optional(),
  contactNumber: z.string().optional(),
  email: z.union([z.string().email("Enter a valid email."), z.literal("")]).optional(),
  facebookUrl: z.string().optional(),
});

export async function editCustomerAction(customerId: string, _prevState: string | undefined, formData: FormData) {
  await requirePermission("CUSTOMER_EDIT");

  const parsed = editCustomerSchema.safeParse({
    name: formData.get("name"),
    companyName: formData.get("companyName") ?? "",
    address: formData.get("address") ?? "",
    contactNumber: formData.get("contactNumber") ?? "",
    email: formData.get("email") ?? "",
    facebookUrl: formData.get("facebookUrl") ?? "",
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const { name, companyName, address, contactNumber, email, facebookUrl } = parsed.data;

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      name,
      companyName: companyName || null,
      address: address || null,
      contactNumber: contactNumber || null,
      email: email || null,
      facebookUrl: facebookUrl || null,
    },
  });

  redirect(`/customers/${customerId}`);
}
