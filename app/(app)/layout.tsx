import { requireUser } from "@/lib/session";
import { Shell } from "@/components/layout/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <Shell role={user.role} name={user.name ?? user.email ?? "User"} userId={user.id}>
      {children}
    </Shell>
  );
}
