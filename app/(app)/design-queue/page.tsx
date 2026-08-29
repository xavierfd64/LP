import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/dashboard/section-header";
import { DesignQueueTable } from "@/components/design/design-queue-table";
import { DesignRealtimeListener } from "@/components/design/design-realtime-listener";
import { getDesignQueueRows, getDesignInProgressRows, getDesignCompletedRows } from "@/lib/design-dashboard-data";

const VIEWS = {
  queue: { title: "My Design Queue", sub: "Layouts lined up and waiting for your design.", empty: "Nothing waiting right now — you're all caught up." },
  "in-progress": { title: "In Progress", sub: "Layouts you are currently working on.", empty: "Nothing in progress right now." },
  completed: { title: "Completed", sub: "Layouts you have completed.", empty: "You haven't completed any designs yet." },
} as const;

/**
 * One route, three views via ?view= (the same pattern the Customer nav
 * already uses for Orders/Invoices) — "My Design Queue" (default),
 * "In Progress", "Completed" all render from here, matching the sidebar
 * entries added in nav-config.ts. ADMIN reaches this too (via the
 * always-true can() bypass) since an Admin looking at the design queue
 * directly is reasonable; anyone else without DESIGN_VIEW is redirected
 * the same way /production redirects a Staff account lacking
 * PRODUCTION_VIEW.
 */
export default async function DesignQueuePage({ searchParams }: PageProps<"/design-queue">) {
  const user = await requireUser();
  if (!["ADMIN", "STAFF"].includes(user.role) || !(await can(user, "DESIGN_VIEW"))) redirect("/dashboard");
  const canManage = await can(user, "DESIGN_MANAGE");

  const sp = await searchParams;
  const view = (typeof sp.view === "string" && sp.view in VIEWS ? sp.view : "queue") as keyof typeof VIEWS;
  const meta = VIEWS[view];

  const rows =
    view === "in-progress"
      ? await getDesignInProgressRows(user.id, canManage)
      : view === "completed"
        ? await getDesignCompletedRows(user.id, 100, canManage)
        : await getDesignQueueRows(user.id, canManage);

  return (
    <div className="space-y-4">
      <DesignRealtimeListener />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{meta.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{canManage ? `${meta.sub} Showing every Graphic Artist's work.` : meta.sub}</p>
      </div>
      <Card>
        <CardHeader>
          <SectionHeader title={`${rows.length} ${rows.length === 1 ? "layout" : "layouts"}`} />
        </CardHeader>
        <CardContent className="p-0">
          <DesignQueueTable rows={rows} canManage={canManage} emptyLabel={meta.empty} />
        </CardContent>
      </Card>
    </div>
  );
}
