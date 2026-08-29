import Link from "next/link";
import { Layers, PenTool, CheckCircle2, Clock, Lightbulb } from "lucide-react";
import { KpiCard } from "./kpi-card";
import { SectionHeader } from "./section-header";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DesignQueueTable } from "@/components/design/design-queue-table";
import { DesignRealtimeListener } from "@/components/design/design-realtime-listener";
import { MiniMonthCalendar } from "@/components/design/mini-month-calendar";
import {
  getDesignDashboardSummary,
  getDesignQueueRows,
  getDesignCompletedRows,
} from "@/lib/design-dashboard-data";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const DESIGN_REMINDERS = [
  "Follow brand guidelines",
  "Check spelling and details",
  "Save in CMYK format",
  "Export high quality PDF",
];

/**
 * The Graphic Artist's home page (shown at /dashboard for any STAFF
 * account granted DESIGN_VIEW — see app/(app)/dashboard/page.tsx), built
 * against the approved reference illustration but with entirely real
 * data: every count, queue row, and completed-design entry below comes
 * from this user's actual JobOrderStageLog rows, never a hardcoded
 * example.
 */
export async function GraphicArtistDashboard({ userId, name, canManage }: { userId: string; name: string; canManage: boolean }) {
  const [summary, queueRows, completedRows] = await Promise.all([
    getDesignDashboardSummary(userId),
    getDesignQueueRows(userId),
    getDesignCompletedRows(userId, 6),
  ]);

  const firstName = name.split(" ")[0];
  const todayLabel = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const previewRows = queueRows.slice(0, 5);
  const dueDates = queueRows.filter((r) => r.dueDate).map((r) => r.dueDate as Date);

  return (
    <div className="space-y-6">
      <DesignRealtimeListener />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greeting()}, {firstName}! 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">Here&apos;s your design overview and assigned tasks.</p>
        </div>
        <span className="hidden text-sm text-slate-500 sm:inline">Today · {todayLabel}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Lined Up for Design" value={summary.linedUp} sub="View queue" href="/design-queue" icon={Layers} iconTone="red" />
        <KpiCard
          label="In Progress"
          value={summary.inProgress}
          sub="Continue working"
          href="/design-queue?view=in-progress"
          icon={PenTool}
          iconTone="orange"
        />
        <KpiCard
          label="Completed Today"
          value={summary.completedToday}
          sub="View completed"
          href="/design-queue?view=completed"
          icon={CheckCircle2}
          iconTone="green"
        />
        <KpiCard
          label="Due Today"
          value={summary.dueToday}
          sub="View deadlines"
          href="/design-queue"
          tone={summary.dueToday > 0 ? "attention" : undefined}
          icon={Clock}
          iconTone="blue"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <SectionHeader title={`Design Queue (${queueRows.length})`} actionLabel="View All" actionHref="/design-queue" />
              <p className="mt-1 text-xs text-slate-500">Layouts lined up and waiting for your design.</p>
            </CardHeader>
            <CardContent className="p-0">
              <DesignQueueTable rows={previewRows} canManage={canManage} emptyLabel="Nothing waiting right now — you're all caught up." />
              {queueRows.length > previewRows.length && (
                <p className="px-4 py-3 text-center text-xs text-slate-400">
                  Showing {previewRows.length} of {queueRows.length} layouts —{" "}
                  <Link href="/design-queue" className="font-medium text-brand-600 underline">
                    view all
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionHeader title="Recent Completed Designs" actionLabel="View All" actionHref="/design-queue?view=completed" />
              <p className="mt-1 text-xs text-slate-500">Layouts you have recently completed.</p>
            </CardHeader>
            <CardContent>
              {completedRows.length === 0 ? (
                <p className="text-sm text-slate-400">You haven&apos;t completed any designs yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {completedRows.map((r) => (
                    <Link
                      key={r.stageLogId}
                      href={`/job-orders/${r.jobOrderId}`}
                      className="rounded-lg border border-slate-200 p-3 hover:border-brand-300 hover:bg-brand-50/40"
                    >
                      <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Completed
                      </span>
                      <p className="mt-1.5 truncate text-sm font-semibold text-slate-900">{r.joNumber}</p>
                      <p className="truncate text-xs text-slate-500">{r.product}</p>
                      <p className="truncate text-xs text-slate-500">{r.customerName}</p>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <MiniMonthCalendar dueDates={dueDates} />

          <Card>
            <CardHeader>
              <SectionHeader title="Design Reminders" />
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                {DESIGN_REMINDERS.map((r) => (
                  <li key={r} className="flex items-start gap-2">
                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
                    {r}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
