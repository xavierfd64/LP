import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/utils";
import { closeInquiryAction, cancelInquiryAction, restoreInquiryAction } from "@/app/actions/inquiries";
import { InquiryEditForm } from "./inquiry-edit-form";
import { StaffCancelInquiryForm } from "./staff-cancel-inquiry-form";
import { isActiveQuotationStatus } from "@/lib/quotation-status";
import { DiscussInChatboxButton } from "@/components/messaging/discuss-in-chatbox-button";
import { EditorShell, EditorHeader, EditorGrid, EditorPanel, InfoField } from "@/components/documents/editor-shell";

export default async function InquiryDetailPage({ params, searchParams }: PageProps<"/inquiries/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: { customer: true, quotations: true, service: true, cancelledBy: true },
  });
  if (!inquiry) notFound();

  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (inquiry.customerId !== customer.id) redirect("/inquiries");
  } else if (user.role === "STAFF" && !(await can(user, "INQUIRY_VIEW"))) {
    redirect("/dashboard");
  }

  const canHandle = user.role === "ADMIN" || (await can(user, "INQUIRY_HANDLE"));
  const canCreateQuotation = user.role === "ADMIN" || (await can(user, "QUOTATION_CREATE"));
  const canViewComms = user.role === "ADMIN" || (await can(user, "COMMUNICATION_VIEW"));
  const canCancel = user.role === "ADMIN" || (await can(user, "INQUIRY_CANCEL"));

  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;
  const closeAction = closeInquiryAction.bind(null, inquiry.id);
  const cancelAction = cancelInquiryAction.bind(null, inquiry.id);
  const activeQuotation = inquiry.quotations.find((q) => isActiveQuotationStatus(q.status));
  const canConvert = inquiry.status !== "CLOSED" && inquiry.status !== "CANCELLED" && !activeQuotation;
  const canCustomerEdit = user.role === "CUSTOMER" && inquiry.status === "NEW";

  const specs = (inquiry.specs as Record<string, string> | null) ?? null;
  const instantQuotation = inquiry.quotations.find((q) => "isInstant" in q && q.isInstant);

  return (
    <EditorShell>
      <EditorHeader
        eyebrow="Inquiry"
        title={inquiry.desiredProduct}
        subtitle={isStaffLike ? inquiry.customer.name : undefined}
        status={<StatusBadge status={inquiry.status} />}
      />

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      {inquiry.status === "CANCELLED" && (
        <Alert tone="error">
          Cancelled by {inquiry.cancelledBy?.name ?? "customer"}
          {inquiry.cancelledAt ? ` on ${formatDateTime(inquiry.cancelledAt)}` : ""}: {inquiry.cancelReason}
        </Alert>
      )}

      {!isStaffLike && inquiry.status === "NEW" && !instantQuotation && (
        <Alert tone="info">
          <span className="font-medium">Quotation Required.</span> Our team will review your requirements and
          prepare a quotation for you shortly.
        </Alert>
      )}
      {instantQuotation && (
        <Alert tone="success">
          An instant quotation was generated automatically —{" "}
          <Link href={`/quotations/${instantQuotation.id}`} className="font-medium underline">
            {instantQuotation.quoteNumber}
          </Link>
          .
        </Alert>
      )}

      <EditorGrid>
        {isStaffLike && (
          <EditorPanel title="Customer Information">
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="Customer" value={inquiry.customer.name} />
              <InfoField label="Company" value={inquiry.customer.companyName} />
              <InfoField label="Email" value={inquiry.customer.email} />
              <InfoField label="Contact" value={inquiry.customer.contactNumber} />
            </div>
          </EditorPanel>
        )}
        <EditorPanel title="Inquiry Information">
          <div className="grid grid-cols-2 gap-3">
            <InfoField label="Date" value={formatDateTime(inquiry.createdAt)} />
            <InfoField label="Status" value={<StatusBadge status={inquiry.status} />} />
            <InfoField label="Service" value={inquiry.desiredProduct} />
            <InfoField label="Rough Quantity" value={inquiry.roughQty ?? "—"} />
          </div>
        </EditorPanel>
      </EditorGrid>

      <EditorPanel title="Requirements">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs text-slate-400">Description</p>
            <p className="whitespace-pre-wrap text-sm text-slate-800">{inquiry.description}</p>
          </div>
          {specs && Object.keys(specs).length > 0 && (
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
              {Object.entries(specs).map(([k, v]) => (
                <InfoField key={k} label={k} value={v} />
              ))}
            </div>
          )}
        </div>
      </EditorPanel>

      {inquiry.quotations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Linked quotations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inquiry.quotations.map((q) => (
              <div key={q.id} className="flex items-center justify-between text-sm">
                <Link href={`/quotations/${q.id}`} className="font-medium text-slate-900 underline">
                  {q.quoteNumber}
                </Link>
                <StatusBadge status={q.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isStaffLike && activeQuotation && (
        <Alert tone="info">
          This inquiry already has an active quotation —{" "}
          <Link href={`/quotations/${activeQuotation.id}`} className="font-medium underline">
            {activeQuotation.quoteNumber}
          </Link>{" "}
          ({activeQuotation.status.replace(/_/g, " ")}). Revise that one instead of creating a new one.
        </Alert>
      )}

      {isStaffLike && (canConvert || inquiry.status !== "CLOSED") && (
        <div className="flex flex-wrap gap-2">
          {canConvert && canCreateQuotation && (
            <Link href={`/quotations/new?inquiryId=${inquiry.id}`}>
              <Button>Convert to Quotation</Button>
            </Link>
          )}
          {inquiry.status !== "CLOSED" && inquiry.status !== "CANCELLED" && canHandle && (
            <form action={closeAction}>
              <Button variant="outline" type="submit">
                Close Inquiry
              </Button>
            </form>
          )}
          {canCancel && (inquiry.status === "NEW" || inquiry.status === "QUOTED") && (
            <StaffCancelInquiryForm inquiryId={inquiry.id} />
          )}
          {canCancel && inquiry.status === "CANCELLED" && (
            <form action={restoreInquiryAction.bind(null, inquiry.id)}>
              <Button variant="outline" type="submit">
                Restore Inquiry
              </Button>
            </form>
          )}
        </div>
      )}

      {canCustomerEdit && (
        <div className="space-y-3">
          <InquiryEditForm
            inquiry={{
              id: inquiry.id,
              description: inquiry.description,
              roughQty: inquiry.roughQty,
              specs: (inquiry.specs as Record<string, string> | null) ?? null,
              service: inquiry.service
                ? {
                    id: inquiry.service.id,
                    name: inquiry.service.name,
                    category: inquiry.service.category,
                    specFields: (inquiry.service.specFields as string[]) ?? [],
                    workflowTemplateId: inquiry.service.workflowTemplateId,
                  }
                : null,
            }}
          />
          <form action={cancelAction}>
            <Button variant="destructive" size="sm" type="submit">
              Cancel Inquiry
            </Button>
          </form>
        </div>
      )}

      {(!isStaffLike || canViewComms) && (
        <DiscussInChatboxButton refType="INQUIRY" refId={inquiry.id} label={inquiry.desiredProduct} />
      )}
    </EditorShell>
  );
}
