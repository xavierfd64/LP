import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

export async function logAudit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  changes?: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      changes: changes ? (changes as Prisma.InputJsonValue) : undefined,
    },
  });
}
