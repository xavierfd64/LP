import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { markStageInProgressAction } from "@/app/actions/production";
import { CompleteStageForm } from "./complete-stage-form";

export default async function ProductionQueuePage({ searchParams }: PageProps<"/production">) {
  await requireRole(["PRODUCTION", "ADMIN", "STAFF"]);
  const sp = await searchParams;
  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;

  const jobOrders = await prisma.jobOrder.findMany({
    where: { status: { in: ["IN_PROGRESS", "REWORK", "QC"] } },
    include: {
      order: { include: { customer: true } },
      stageLogs: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { deadline: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Production Queue</h1>
      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>JO #</TH>
              <TH>Product</TH>
              <TH>Qty</TH>
              <TH>Customer</TH>
              <TH>Deadline</TH>
              <TH>Current stage</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {jobOrders.map((jo) => {
              const currentLog = jo.stageLogs.find(
                (l) => l.stageOrder === jo.currentStageOrder && l.status !== "COMPLETED"
              );
              const markIP = currentLog
                ? markStageInProgressAction.bind(null, currentLog.id, jo.id)
                : undefined;

              return (
                <TR key={jo.id}>
                  <TD className="font-medium text-slate-900">
                    <Link href={`/job-orders/${jo.id}`} className="underline">
                      {jo.joNumber}
                    </Link>
                  </TD>
                  <TD>{jo.productType}</TD>
                  <TD>{jo.quantity}</TD>
                  <TD>{jo.order.customer.name}</TD>
                  <TD>{formatDate(jo.deadline)}</TD>
                  <TD>
                    {jo.status === "QC" ? (
                      <span className="text-sm text-blue-700 font-medium">Awaiting QC</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        {currentLog?.stageName ?? "—"}
                        {currentLog && <StatusBadge status={currentLog.status} />}
                      </span>
                    )}
                  </TD>
                  <TD>
                    {jo.status === "QC" ? (
                      <Link href={`/job-orders/${jo.id}`} className="text-sm font-medium text-slate-900 underline">
                        Go to QC
                      </Link>
                    ) : currentLog?.status === "READY" ? (
                      <form action={markIP}>
                        <Button type="submit" size="sm" variant="outline">
                          Start Stage
                        </Button>
                      </form>
                    ) : currentLog?.status === "IN_PROGRESS" ? (
                      <CompleteStageForm jobOrderId={jo.id} stageLogId={currentLog.id} />
                    ) : null}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {jobOrders.length === 0 && <EmptyState label="Nothing in production right now." />}
      </Card>
    </div>
  );
}
