import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import type { SecurityHistoryEvent } from "@/lib/security-history";

/**
 * Shared login/security history table (Sept 8) — used both on the
 * self-service My Profile page (a user's own events) and on the Admin's
 * per-user Security History page (app/(app)/admin/users/[userId]/
 * security-history/page.tsx). Deliberately not shown to CUSTOMER
 * accounts anywhere (spec: "do not expose security history to ordinary
 * customers unless specifically appropriate").
 */
export function SecurityHistoryTable({ events }: { events: SecurityHistoryEvent[] }) {
  if (events.length === 0) {
    return <EmptyState label="No security activity recorded yet." />;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <THead>
          <TR>
            <TH>Date</TH>
            <TH>Event</TH>
            <TH>Device</TH>
            <TH>IP</TH>
            <TH>Result</TH>
          </TR>
        </THead>
        <TBody>
          {events.map((e) => (
            <TR key={e.id}>
              <TD className="whitespace-nowrap">{formatDateTime(e.createdAt)}</TD>
              <TD>{e.label}</TD>
              <TD>{e.device ?? "—"}</TD>
              <TD>{e.ip ?? "—"}</TD>
              <TD>
                <Badge tone={e.result === "Success" ? "green" : "red"}>{e.result}</Badge>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
