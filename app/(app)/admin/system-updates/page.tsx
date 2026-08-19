import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SYSTEM_VERSION } from "@/lib/system-version";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { checkForUpdatesAction } from "@/app/actions/system-updates";

export default async function SystemUpdatesPage() {
  await requireRole(["ADMIN"]);

  const history = await prisma.auditLog.findMany({
    where: { action: { startsWith: "SYSTEM_UPDATE" } },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">System Updates</h1>
        <p className="text-sm text-slate-500">
          This page establishes the foundation for one-click system/security updates — version tracking, an
          audit-logged check flow, and this history table. There is no connected update server yet, so &quot;Check
          for Updates&quot; always reports current, rather than pretending one exists (per this update&apos;s own
          scope: architecture first, a real trusted update source later).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current System Version</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-3xl font-bold text-slate-900">{SYSTEM_VERSION}</p>
          <div className="flex items-center gap-2 rounded-md bg-success-100 px-3 py-2 text-sm font-medium text-success-800">
            <CheckCircle2 className="h-4 w-4" />
            Your system is up to date. No update server is configured.
          </div>
          <form action={checkForUpdatesAction}>
            <Button type="submit" variant="outline">
              Check for Updates
            </Button>
          </form>
          <p className="text-xs text-slate-400">
            Themes and plugins are managed separately —{" "}
            <Link href="/admin/themes" className="underline">
              Themes
            </Link>{" "}
            ·{" "}
            <Link href="/admin/plugins" className="underline">
              Plugins
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Update History</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Event</TH>
              <TH>Checked By</TH>
            </TR>
          </THead>
          <TBody>
            {history.map((h) => {
              const changes = (h.changes as Record<string, unknown> | null) ?? {};
              return (
                <TR key={h.id}>
                  <TD className="text-sm text-slate-500">{formatDateTime(h.createdAt)}</TD>
                  <TD className="text-sm text-slate-900">
                    Checked for updates — version {String(changes.version ?? "—")}, result:{" "}
                    {String(changes.result ?? "—").replace(/_/g, " ")}
                  </TD>
                  <TD className="text-sm text-slate-500">{h.actor?.name ?? "—"}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {history.length === 0 && <EmptyState label="No update checks recorded yet." />}
      </Card>
    </div>
  );
}
