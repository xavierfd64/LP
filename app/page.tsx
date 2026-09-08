import { redirect } from "next/navigation";
import { auth, roleHomePath } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// The root domain is not a public landing page: an unauthenticated visitor
// is sent straight to /login (3rd Update, item 1) rather than shown a
// tracking-form landing page here — that experience now lives only at
// /track, reached via /login's "Track Your Order" button, so it's never
// confused with an auto-login. An authenticated visitor still lands on
// their role's home page, unchanged from before — except a force-reset
// account (Sept 8), sent straight to /change-password instead so it
// doesn't bounce through the role home first (requireUser() there would
// just redirect it again; this is a one-hop UX nicety, not the actual
// enforcement point — see that function's doc comment).
export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { mustChangePassword: true } });
  if (dbUser?.mustChangePassword) redirect("/change-password");

  redirect(roleHomePath(session.user.role));
}
