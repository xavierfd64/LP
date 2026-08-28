import { DesktopSidebar } from "./desktop-sidebar";
import { MobileNav } from "./mobile-nav";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";
import { GlobalSearch } from "./global-search";
import { ChatButton } from "./chat-button";
import { navForRole } from "./nav-config";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { getStaffPermissions } from "@/lib/permissions-guard";
import { RealtimeProvider } from "@/components/realtime/realtime-provider";
import { RefreshOnNotification } from "@/components/realtime/refresh-on-notification";
import { FloatingChatWidget } from "@/components/messaging/floating-chat-widget";
import { getBusinessSettings } from "@/lib/business-settings";
import { BrandLogo } from "@/components/branding/brand-logo";

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
  const sections = navForRole(role, staffPermissions);
  // Same floating chat everywhere — Customer always has it, Admin always
  // bypasses, Staff only if granted COMMUNICATION_VIEW (mirrors the guard
  // the /messages pages and the widget's own server actions already
  // enforce, so this is UI convenience on top of real backend checks, not
  // the only thing standing between an unauthorized Staff account and
  // customer conversations).
  const showChatWidget =
    role === "CUSTOMER" || role === "ADMIN" || (role === "STAFF" && staffPermissions?.has("COMMUNICATION_VIEW"));
  const showGlobalSearch = role === "ADMIN" || role === "STAFF";
  const [notifications, unreadCount, settings] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.notification.count({ where: { userId, read: false } }),
    getBusinessSettings(),
  ]);

  return (
    <div className="flex min-h-screen">
      <RealtimeProvider />
      <RefreshOnNotification />
      <DesktopSidebar sections={sections} businessName={settings.businessName} tagline={settings.tagline} logoPath={settings.logoPath} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-3 sm:px-6">
          <div className="flex shrink-0 items-center gap-2">
            <MobileNav sections={sections} businessName={settings.businessName} tagline={settings.tagline} logoPath={settings.logoPath} />
            <div className="flex items-center gap-2 font-bold text-slate-900 md:hidden">
              <BrandLogo src={settings.logoPath} alt={settings.businessName} size={24} />
              {settings.businessName}
            </div>
          </div>

          {showGlobalSearch && (
            <div className="hidden flex-1 justify-center sm:flex">
              <GlobalSearch />
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            {showChatWidget && <ChatButton />}
            <NotificationBell notifications={notifications} unreadCount={unreadCount} />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{name}</p>
              <Badge tone="slate">{role}</Badge>
            </div>
            <LogoutButton />
          </div>
        </header>
        {showGlobalSearch && (
          <div className="border-b border-slate-100 bg-white px-3 py-2 sm:hidden">
            <GlobalSearch />
          </div>
        )}
        <main className={`min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6 ${role === "CUSTOMER" ? "pb-20 md:pb-6" : ""}`}>{children}</main>
      </div>
      {showChatWidget && <FloatingChatWidget currentUserId={userId} role={role} />}
      {role === "CUSTOMER" && <MobileBottomNav />}
    </div>
  );
}
