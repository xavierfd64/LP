import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/utils";
import { releaseJobOrderAction } from "@/app/actions/payments";
import { QCForm } from "./qc-form";

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
      qcResults: { orderBy: { createdAt: "desc" }, include: { inspector: true, reworkRecord: { include: { assignedTo: true } } } },
    },
  });
  if (!jo) notFound();

  const isProductionLike = user.role === "PRODUCTION" || isStaffLike;

  if (!isStaffLike && user.role === "CUSTOMER") {
    const customer = await getCurrentCustomer(user.id);
    if (jo.order.customerId !== customer.id) redirect("/orders");
  }

  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;
  const release = releaseJobOrderAction.bind(null, jo.id);

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
        <div className="flex items-center gap-3">
          <StatusBadge status={jo.status} />
          {isStaffLike && jo.status === "READY" && (
            <form action={release}>
              <Button type="submit" size="sm">
                Release
              </Button>
            </form>
          )}
        </div>
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      {jo.status === "QC" && isProductionLike && (
        <Card>
          <CardHeader>
            <CardTitle>Record QC result</CardTitle>
          </CardHeader>
          <CardContent>
            <QCForm
              jobOrderId={jo.id}
              quantity={jo.quantity}
              stages={jo.workflowTemplate.stages.filter((s) => !s.isQCStage)}
              defaultAssignedStage={
                jo.workflowTemplate.stages.find((s) => s.order === jo.currentStageOrder - 1)?.name
              }
            />
          </CardContent>
        </Card>
      )}

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

      {jo.qcResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>QC history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {jo.qcResults.map((qc) => (
              <div key={qc.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {qc.stageName} — <StatusBadge status={qc.result} />
                  </span>
                  <span className="text-slate-500">{formatDateTime(qc.createdAt)}</span>
                </div>
                <p className="mt-1 text-slate-600">
                  Checked {qc.quantityChecked}, failed {qc.quantityFailed} · Inspector: {qc.inspector.name}
                </p>
                {qc.defectNotes && <p className="mt-1 text-slate-700">{qc.defectNotes}</p>}
                {qc.reworkRecord && (
                  <div className="mt-2 rounded bg-red-50 p-2 text-red-800">
                    <p className="font-medium">
                      Rework — <StatusBadge status={qc.reworkRecord.status} />
                    </p>
                    <p>
                      Routed to <span className="font-medium">{qc.reworkRecord.assignedStage}</span>: {qc.reworkRecord.defectDescription} ({qc.reworkRecord.quantityAffected} pcs)
                    </p>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
