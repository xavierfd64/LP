"use server";

import { prisma } from "@/lib/prisma";

/**
 * Called right before the client triggers window.print() on a shared
 * document. Re-checks accessLevel/expiry/revocation server-side — the
 * actual enforcement — rather than trusting that the Download button was
 * only rendered for VIEW_DOWNLOAD links. Returns false (no download
 * recorded, caller must not proceed to print) for anything else.
 */
export async function recordDocumentDownloadAction(token: string): Promise<boolean> {
  const link = await prisma.documentShareLink.findUnique({ where: { token } });
  if (!link) return false;
  if (link.revokedAt) return false;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return false;
  if (link.accessLevel !== "VIEW_DOWNLOAD") return false;

  await prisma.documentShareLink.update({
    where: { id: link.id },
    data: { downloadCount: { increment: 1 }, lastDownloadedAt: new Date() },
  });
  return true;
}
