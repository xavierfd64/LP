import Image from "next/image";
import { SidebarNav } from "./sidebar-nav";
import { MobileNav } from "./mobile-nav";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";
import { navForRole } from "./nav-config";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { getStaffPermissions } from "@/lib/permissions-guard";
import { RealtimeProvider } from "@/components/realtime/realtime-provider";
import { FloatingChatWidget } from "@/components/messaging/floating-chat-widget";
import { getBusinessSettings } from "@/lib/business-settings";

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
  const staffPermissions = role === "STAFF" ? await getStaffPermissions(userId, role) : undefined;
  const items = navForRole(role, staffPermissions);
  const [notifications, unreadCount, settings] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.notification.count({ where: { userId, read: false } }),
    getBusinessSettings(),
  ]);

  return (
    <div className="flex min-h-screen">
      <RealtimeProvider />
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          {settings.logoPath && (
            <Image
              src={settings.logoPath}
              alt={settings.businessName}
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 rounded object-contain"
              unoptimized
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-slate-900">{settings.businessName}</p>
            {settings.tagline && <p className="truncate text-xs text-slate-400">{settings.tagline}</p>}
          </div>
        </div>
        <SidebarNav items={items} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <MobileNav items={items} businessName={settings.businessName} tagline={settings.tagline} logoPath={settings.logoPath} />
            <div className="flex items-center gap-2 font-bold text-slate-900 md:hidden">
              {settings.logoPath && (
                <Image src={settings.logoPath} alt={settings.businessName} width={24} height={24} className="h-6 w-6 rounded object-contain" unoptimized />
              )}
              {settings.businessName}
            </div>
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
      {role === "CUSTOMER" && <FloatingChatWidget currentUserId={userId} />}
    </div>
  );
}
