import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Settings, BarChart3 } from "lucide-react";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { Button } from "@/components/ui/button";
import { getProductionData, READY_COLUMN } from "@/lib/production-board";
import { renderStageIcon } from "@/lib/production-icons";
import { AddJobDialog } from "@/components/production/add-job-dialog";
import { FocusedBoard } from "../../kanban-board";

/**
 * Focused per-service production board (illustration 2) — what
 * /production (the Overview, illustration 1) links out to via each
 * service's "Open Board" button. `key` is a ServiceBoard.key
 * (lib/production-board.ts): a real Service.id for normal services, or
 * `wf:${workflowTemplateId}` for the legacy no-Service fallback boards —
 * URI-decoded here since the "wf:" prefix and the Overview both
 * URI-encode it before linking.
 */
export default async function ProductionBoardPage({ params }: PageProps<"/production/board/[key]">) {
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);

  const user = await requireRole(["PRODUCTION", "ADMIN", "STAFF"]);
  if (user.role === "STAFF" && !(await can(user, "PRODUCTION_VIEW"))) redirect("/dashboard");
  const canUpdateStage = user.role !== "STAFF" || (await can(user, "PRODUCTION_UPDATE_STAGE"));
  const canMarkStageComplete = user.role !== "STAFF" || (await can(user, "PRODUCTION_MARK_STAGE_COMPLETE"));
  const canDispatchMessenger = user.role === "ADMIN" || (user.role === "STAFF" && (await can(user, "MESSENGER_DISPATCH")));
  const canSeeAmount = user.role !== "PRODUCTION";
  const canAddJob = user.role === "PRODUCTION" || user.role === "ADMIN" || (user.role === "STAFF" && (await can(user, "PRODUCTION_UPDATE_STAGE")));
  const canSeeReports = user.role === "ADMIN" || (user.role === "STAFF" && (await can(user, "REPORTS_VIEW")));
  const canSeeSettings = user.role === "ADMIN";

  const { boards } = await getProductionData(canSeeAmount);
  const board = boards.find((b) => b.key === key);
  if (!board) notFound();

  const realColumns = board.columns.filter((c) => c.name !== READY_COLUMN);
  const activeCount = board.jobOrders.length;
  const overdueCount = board.jobOrders.filter((j) => j.overdue).length;

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      <nav className="text-xs text-slate-400">
        <Link href="/production" className="hover:underline">
          Production Overview
        </Link>{" "}
        › <span className="text-slate-600">{board.label}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
            {renderStageIcon(board.label, "h-5 w-5")}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{board.label}</h1>
            {realColumns.length > 0 && (
              <p className="mt-1 text-sm text-slate-500">Workflow: {realColumns.map((c) => c.name).join(" → ")}</p>
            )}
            <p className="mt-0.5 text-xs text-slate-500">
              Active Jobs: <span className="font-medium text-slate-700">{activeCount}</span>
              {overdueCount > 0 && (
                <>
                  {" "}
                  · <span className="font-medium text-red-600">Overdue: {overdueCount}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSeeSettings && (
            <Link href="/admin/workflow-templates">
              <Button type="button" variant="outline" size="sm">
                <Settings className="h-4 w-4" /> Board Settings
              </Button>
            </Link>
          )}
          {canSeeReports && (
            <Link href="/reports/summary">
              <Button type="button" variant="outline" size="sm">
                <BarChart3 className="h-4 w-4" /> Reports
              </Button>
            </Link>
          )}
          {canAddJob && board.serviceId && realColumns.length > 0 && (
            <AddJobDialog
              services={[{ id: board.serviceId, name: board.label, stages: realColumns }]}
              defaultServiceId={board.serviceId}
              triggerLabel="+ Add Job to Stage"
            />
          )}
        </div>
      </div>

      <FocusedBoard
        board={board}
        canUpdateStage={canUpdateStage}
        canMarkStageComplete={canMarkStageComplete}
        canDispatchMessenger={canDispatchMessenger}
        canAddJob={canAddJob}
        canSeeSettings={canSeeSettings}
        canSeeReports={canSeeReports}
        currentUserName={user.name ?? "You"}
      />
    </div>
  );
}
