import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

/** Data layer for the redesigned /admin/users page (Sept 8) — same one-authoritative-filter pattern as the other list dashboards (lib/orders-list.ts, lib/payments-list.ts). */

export type UserSearchFilters = {
  q?: string;
  role?: "ADMIN" | "STAFF" | "PRODUCTION" | "CUSTOMER";
  status?: "active" | "inactive";
};
export type UserListFilters = UserSearchFilters & { page: number; pageSize: number };

export function buildUserWhere({ q, role, status }: UserSearchFilters): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (role) where.role = role;
  if (status) where.active = status === "active";
  if (q && q.trim()) {
    const query = q.trim();
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { phone: { contains: query, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function getPaginatedUsers(filters: UserListFilters) {
  const { page, pageSize, ...searchFilters } = filters;
  const where = buildUserWhere(searchFilters);
  const skip = (page - 1) * pageSize;

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
