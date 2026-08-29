import { redirect } from "next/navigation";
import { auth, roleHomePath } from "@/lib/auth";

// The root domain is not a public landing page: an unauthenticated visitor
// is sent straight to /login (3rd Update, item 1) rather than shown a
// tracking-form landing page here — that experience now lives only at
// /track, reached via /login's "Track Your Order" button, so it's never
// confused with an auto-login. An authenticated visitor still lands on
// their role's home page, unchanged from before.
export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(roleHomePath(session.user.role));
}
