import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // JWT sessions don't re-validate against the DB on their own, so a
  // deactivated account would otherwise stay usable until the token expires.
  // Check fresh on every request instead — this can run during a page
  // render, where clearing the session cookie isn't possible, so we just
  // redirect; the stale cookie is harmless since every request re-checks.
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { active: true } });
  if (!dbUser || !dbUser.active) {
    redirect("/login?error=" + encodeURIComponent("This account has been deactivated."));
  }

  return session.user;
}

export async function requireRole(roles: string[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
