import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { EMAIL_EVENTS, type EmailEventKey } from "@/lib/email-events";
import { retryEmailAction } from "@/app/actions/email-log";

const STATUS_TONE: Record<string, "green" | "red" | "blue" | "yellow"> = {
  SENT: "green",
  FAILED: "red",
  SENDING: "blue",
  QUEUED: "yellow",
};

export default async function EmailLogPage() {
  const user = await requireRole(["ADMIN", "STAFF"]);
  if (user.role === "STAFF" && !(await can(user, "EMAIL_LOG_VIEW"))) redirect("/dashboard");

  const logs = await prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Email Log</h1>
        <p className="text-sm text-slate-500">Every email the system has queued, across all events — most recent 100.</p>
      </div>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Date/Time</TH>
              <TH>Recipient</TH>
              <TH>Subject</TH>
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
                <TD className="text-sm">{log.recipientEmail}</TD>
                <TD className="max-w-xs truncate text-sm">{log.subject}</TD>
                <TD className="text-sm">{EMAIL_EVENTS[log.eventType as EmailEventKey]?.label ?? log.eventType}</TD>
                <TD className="text-xs text-slate-400">{log.relatedType ?? "—"}</TD>
                <TD>
                  <Badge tone={STATUS_TONE[log.status] ?? "slate"}>{log.status}</Badge>
                </TD>
                <TD className="max-w-xs truncate text-xs text-red-600">{log.failureReason ?? "—"}</TD>
                <TD>
                  {log.status === "FAILED" && (
                    <form action={retryEmailAction.bind(null, log.id)}>
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
        {logs.length === 0 && <EmptyState label="No emails sent yet." />}
      </Card>
    </div>
  );
}
