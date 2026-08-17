import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime } from "@/lib/utils";
import { DocumentShell, DocumentField, DocumentSection } from "@/components/documents/document-shell";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";

export default async function JobOrderPrintPage({ params }: PageProps<"/job-orders/[id]/print">) {
  const { id } = await params;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const jo = await prisma.jobOrder.findUnique({
    where: { id },
    include: {
      order: { include: { customer: { include: { user: true } }, quotation: true } },
      stageLogs: { orderBy: { stageOrder: "asc" }, include: { assignedTo: true } },
    },
  });
  if (!jo) notFound();

  if (!isStaffLike && user.role === "CUSTOMER") {
    const customer = await getCurrentCustomer(user.id);
    if (jo.order.customerId !== customer.id) redirect("/orders");
  } else if (user.role === "STAFF") {
    const [viewOrder, viewProduction, viewFulfillment] = await Promise.all([
      can(user, "ORDER_VIEW"),
      can(user, "PRODUCTION_VIEW"),
      can(user, "FULFILLMENT_VIEW"),
    ]);
    if (!viewOrder && !viewProduction && !viewFulfillment) redirect("/dashboard");
  }

  const preparedBy = await prisma.auditLog.findFirst({
    where: { entityType: "JobOrder", entityId: jo.id, action: "JOB_ORDER_CREATED" },
    include: { actor: true },
  });

  const currentStage = jo.stageLogs.find((s) => s.stageOrder === jo.currentStageOrder);
  const lastCompletedStage = [...jo.stageLogs].reverse().find((s) => s.status === "COMPLETED");

  const contact =
    jo.order.customer.email ?? jo.order.customer.contactNumber ?? jo.order.customer.user?.email ?? jo.order.customer.user?.phone ?? null;

  return (
    <DocumentShell title="Job Order" documentNumber={jo.joNumber}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DocumentField label="Job Order Number" value={jo.joNumber} />
        <DocumentField label="Date Created" value={formatDate(jo.createdAt)} />
        <DocumentField label="Due Date" value={jo.deadline ? formatDate(jo.deadline) : null} />
        <DocumentField label="Status" value={<DocumentStatusBadge status={jo.status} />} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DocumentField label="Customer" value={jo.order.customer.name} />
        <DocumentField label="Contact" value={contact} />
        <DocumentField label="Address" value={jo.order.customer.address} />
        <DocumentField label="Related Order" value={jo.order.orderNumber} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DocumentField label="Related Quotation" value={jo.order.quotation?.quoteNumber ?? null} />
        <DocumentField label="Prepared By" value={preparedBy?.actor?.name ?? null} />
        <DocumentField label="Assigned Staff" value={currentStage?.assignedTo?.name ?? null} />
        <DocumentField label="Current Stage" value={currentStage?.stageName ?? "—"} />
      </div>

      <DocumentSection title="Item / Service">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-900">{jo.productType}</p>
          <p className="text-sm text-slate-600">Quantity: {jo.quantity}</p>
        </div>
      </DocumentSection>

      <DocumentSection title="Description">
        <p className="text-sm whitespace-pre-wrap text-slate-700">{jo.description || "—"}</p>
      </DocumentSection>

      <DocumentSection title="Production Instructions">
        <p className="text-sm whitespace-pre-wrap text-slate-700">{jo.productionInstructions || "—"}</p>
      </DocumentSection>

      {currentStage?.notes && (
        <DocumentSection title="Notes">
          <p className="text-sm whitespace-pre-wrap text-slate-700">{currentStage.notes}</p>
        </DocumentSection>
      )}

      <DocumentSection title="Completion Information">
        {jo.status === "COMPLETED" || jo.status === "RELEASED" ? (
          <p className="text-sm text-slate-700">
            Completed{lastCompletedStage ? ` on ${formatDateTime(lastCompletedStage.completedAt)}` : ""}.
          </p>
        ) : (
          <p className="text-sm text-slate-400">Not yet completed.</p>
        )}
      </DocumentSection>
    </DocumentShell>
  );
}
