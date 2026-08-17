import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { MESSENGER_EVENTS } from "@/lib/messenger-events";
import { retryMessengerAction } from "@/app/actions/messenger-log";

const STATUS_TONE: Record<string, "green" | "red" | "blue" | "yellow" | "slate"> = {
  SENT: "green",
  FAILED: "red",
  SENDING: "blue",
  QUEUED: "yellow",
  SKIPPED: "slate",
};

export default async function MessengerLogPage() {
  const user = await requireRole(["ADMIN", "STAFF"]);
  if (user.role === "STAFF" && !(await can(user, "EMAIL_LOG_VIEW"))) redirect("/dashboard");

  const logs = await prisma.messengerLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { customer: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Messenger Log</h1>
        <p className="text-sm text-slate-500">
          Every Messenger update the system has attempted, across all events — most recent 100. SKIPPED means the
          customer hasn&apos;t connected Messenger yet, or the Page isn&apos;t configured.
        </p>
      </div>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Date/Time</TH>
              <TH>Customer</TH>
              <TH>Message</TH>
              <TH>Type</TH>
              <TH>Related</TH>
              <TH>Status</TH>
              <TH>Failure Reason</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {logs.map((log) => (
              <TR key={log.id}>
                <TD className="whitespace-nowrap text-sm text-slate-500">{formatDateTime(log.createdAt)}</TD>
                <TD className="text-sm">{log.customer.name}</TD>
                <TD className="max-w-xs truncate text-sm">{log.message}</TD>
                <TD className="text-sm">{MESSENGER_EVENTS[log.eventType]?.label ?? log.eventType}</TD>
                <TD className="text-xs text-slate-400">{log.relatedType ?? "—"}</TD>
                <TD>
                  <Badge tone={STATUS_TONE[log.status] ?? "slate"}>{log.status}</Badge>
                </TD>
                <TD className="max-w-xs truncate text-xs text-red-600">{log.failureReason ?? "—"}</TD>
                <TD>
                  {log.status === "FAILED" && (
                    <form action={retryMessengerAction.bind(null, log.id)}>
                      <Button type="submit" size="sm" variant="outline">
                        Retry
                      </Button>
                    </form>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {logs.length === 0 && <EmptyState label="No Messenger activity yet." />}
      </Card>
    </div>
  );
}
