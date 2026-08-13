import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  switch (session.user.role) {
    case "ADMIN":
      redirect("/admin/dashboard");
    case "PRODUCTION":
      redirect("/production");
    default:
      redirect("/dashboard");
  }
}
