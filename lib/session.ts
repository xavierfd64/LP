import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

/**
 * `allowMustChangePassword` is used ONLY by the /change-password page and
 * its own server action (Sept 8 — User Management/Password Reset/Login
 * Security improvement) — every other call site in the app (every
 * protected layout, every requireRole/requirePermission call, meaning
 * every other page AND every Server Action) leaves it unset, so a
 * force-reset account is redirected here regardless of which URL it
 * requests, whether it opens a new tab, hits back/forward, refreshes, or
 * calls a Server Action directly — this is the one place that check
 * happens, and it's a fresh DB read on every single request, the same
 * mechanism `active` already uses just below.
 */
export async function requireUser(options?: { allowMustChangePassword?: boolean }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // JWT sessions don't re-validate against the DB on their own, so a
  // deactivated account would otherwise stay usable until the token expires.
  // Check fresh on every request instead — this can run during a page
  // render, where clearing the session cookie isn't possible, so we just
  // redirect; the stale cookie is harmless since every request re-checks.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { active: true, mustChangePassword: true },
  });
  if (!dbUser || !dbUser.active) {
    redirect("/login?error=" + encodeURIComponent("This account has been deactivated."));
  }
  if (dbUser.mustChangePassword && !options?.allowMustChangePassword) {
    redirect("/change-password");
  }

  return session.user;
}

export async function requireRole(roles: string[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
