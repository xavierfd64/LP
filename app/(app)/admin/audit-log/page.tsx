import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

export default async function AuditLogPage({ searchParams }: PageProps<"/admin/audit-log">) {
  await requireRole(["ADMIN"]);
  const sp = await searchParams;

  const entityType = typeof sp.entityType === "string" ? sp.entityType : undefined;
  const actorId = typeof sp.actorId === "string" ? sp.actorId : undefined;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;

  const where: Prisma.AuditLogWhereInput = {};
  if (entityType) where.entityType = entityType;
  if (actorId) where.actorId = actorId;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(new Date(to).getTime() + 86400000) } : {}),
    };
  }

  const [logs, entityTypes, users] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { actor: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true } }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>

      <Card>
        <form className="grid grid-cols-1 items-end gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label htmlFor="entityType">Entity</Label>
            <Select id="entityType" name="entityType" defaultValue={entityType ?? ""}>
              <option value="">All</option>
              {entityTypes.map((e) => (
                <option key={e.entityType} value={e.entityType}>
                  {e.entityType}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="actorId">User</Label>
            <Select id="actorId" name="actorId" defaultValue={actorId ?? ""}>
              <option value="">All</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="from">From</Label>
            <Input id="from" name="from" type="date" defaultValue={from ?? ""} />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" defaultValue={to ?? ""} />
          </div>
          <Button type="submit">Filter</Button>
        </form>
      </Card>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>Changes</TH>
            </TR>
          </THead>
          <TBody>
            {logs.map((log) => (
              <TR key={log.id}>
                <TD>{formatDateTime(log.createdAt)}</TD>
                <TD>{log.actor?.name ?? "System"}</TD>
                <TD className="font-medium text-slate-900">{log.action}</TD>
                <TD>
                  {log.entityType} <span className="text-xs text-slate-400">{log.entityId.slice(0, 8)}</span>
                </TD>
                <TD className="max-w-xs truncate text-xs text-slate-500">
                  {log.changes ? JSON.stringify(log.changes) : "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {logs.length === 0 && <EmptyState label="No audit log entries match these filters." />}
      </Card>
    </div>
  );
}
