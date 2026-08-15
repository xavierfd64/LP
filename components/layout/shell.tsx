import { SidebarNav } from "./sidebar-nav";
import { MobileNav } from "./mobile-nav";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";
import { navForRole } from "./nav-config";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";

export async function Shell({
  role,
  name,
  userId,
  children,
}: {
  role: string;
  name: string;
  userId: string;
  children: React.ReactNode;
}) {
  const items = navForRole(role);
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex">
        <div className="mb-6 px-2">
          <p className="text-lg font-bold text-slate-900">LP Printing</p>
          <p className="text-xs text-slate-400">Business Management</p>
        </div>
        <SidebarNav items={items} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <MobileNav items={items} />
            <div className="font-bold text-slate-900 md:hidden">LP Printing</div>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <NotificationBell notifications={notifications} unreadCount={unreadCount} />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{name}</p>
              <Badge tone="slate">{role}</Badge>
            </div>
            <LogoutButton />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
