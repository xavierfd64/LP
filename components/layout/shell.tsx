import { SidebarNav } from "./sidebar-nav";
import { LogoutButton } from "./logout-button";
import { navForRole } from "./nav-config";
import { Badge } from "@/components/ui/badge";

export function Shell({
  role,
  name,
  children,
}: {
  role: string;
  name: string;
  children: React.ReactNode;
}) {
  const items = navForRole(role);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex">
        <div className="mb-6 px-2">
          <p className="text-lg font-bold text-slate-900">LP Printing</p>
          <p className="text-xs text-slate-400">Business Management</p>
        </div>
        <SidebarNav items={items} />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="md:hidden font-bold text-slate-900">LP Printing</div>
          <div className="flex items-center gap-3 ml-auto">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{name}</p>
              <Badge tone="slate">{role}</Badge>
            </div>
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
