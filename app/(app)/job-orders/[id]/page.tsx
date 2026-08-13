import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function JobOrderDetailPage({
  params,
  searchParams,
}: PageProps<"/job-orders/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const jo = await prisma.jobOrder.findUnique({
    where: { id },
    include: {
      order: { include: { customer: true } },
      workflowTemplate: { include: { stages: { orderBy: { order: "asc" } } } },
      stageLogs: { orderBy: { stageOrder: "asc" } },
    },
  });
  if (!jo) notFound();

  if (!isStaffLike && user.role === "CUSTOMER") {
    const customer = await getCurrentCustomer(user.id);
    if (jo.order.customerId !== customer.id) redirect("/orders");
  }

  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {jo.joNumber} — {jo.productType}
          </h1>
          <Link href={`/orders/${jo.orderId}`} className="text-sm text-slate-500 underline">
            {jo.order.orderNumber}
          </Link>
        </div>
        <StatusBadge status={jo.status} />
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-slate-500">Quantity: </span>
            {jo.quantity}
          </p>
          <p>
            <span className="text-slate-500">Workflow: </span>
            {jo.workflowTemplate.name}
          </p>
          <p>
            <span className="text-slate-500">Deadline: </span>
            {formatDate(jo.deadline)}
          </p>
          <p>
            <span className="text-slate-500">Description: </span>
            {jo.description}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workflow stages</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Stage</TH>
              <TH>QC?</TH>
            </TR>
          </THead>
          <TBody>
            {jo.workflowTemplate.stages.map((s) => (
              <TR key={s.id} className={s.order === jo.currentStageOrder ? "bg-blue-50" : ""}>
                <TD>{s.order}</TD>
                <TD className="font-medium">{s.name}</TD>
                <TD>{s.isQCStage ? "QC" : s.isInstallStage ? "Install" : ""}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stage history</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Stage</TH>
              <TH>Status</TH>
              <TH>Started</TH>
              <TH>Completed</TH>
              <TH>Notes</TH>
            </TR>
          </THead>
          <TBody>
            {jo.stageLogs.map((log) => (
              <TR key={log.id}>
                <TD>{log.stageName}</TD>
                <TD>
                  <StatusBadge status={log.status} />
                </TD>
                <TD>{formatDateTime(log.startedAt)}</TD>
                <TD>{formatDateTime(log.completedAt)}</TD>
                <TD>{log.notes ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {jo.stageLogs.length === 0 && <EmptyState label="Production hasn't started yet." />}
      </Card>
    </div>
  );
}
