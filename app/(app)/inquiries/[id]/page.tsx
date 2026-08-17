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
import { closeInquiryAction, cancelInquiryAction } from "@/app/actions/inquiries";
import { InquiryEditForm } from "./inquiry-edit-form";
import { isActiveQuotationStatus } from "@/lib/quotation-status";
import { DiscussInChatboxButton } from "@/components/messaging/discuss-in-chatbox-button";

export default async function InquiryDetailPage({ params, searchParams }: PageProps<"/inquiries/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: { customer: true, quotations: true, service: true },
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

  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;
  const closeAction = closeInquiryAction.bind(null, inquiry.id);
  const cancelAction = cancelInquiryAction.bind(null, inquiry.id);
  const activeQuotation = inquiry.quotations.find((q) => isActiveQuotationStatus(q.status));
  const canConvert = inquiry.status !== "CLOSED" && inquiry.status !== "CANCELLED" && !activeQuotation;
  const canCustomerEdit = user.role === "CUSTOMER" && inquiry.status === "NEW";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900">{inquiry.desiredProduct}</h1>
        <StatusBadge status={inquiry.status} />
      </div>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {isStaffLike && (
            <div>
              <span className="text-slate-500">Customer: </span>
              <span className="font-medium text-slate-900">{inquiry.customer.name}</span>
            </div>
          )}
          <div>
            <span className="text-slate-500">Rough quantity: </span>
            <span className="font-medium text-slate-900">{inquiry.roughQty ?? "—"}</span>
          </div>
          <div>
            <span className="text-slate-500">Submitted: </span>
            <span className="font-medium text-slate-900">{formatDateTime(inquiry.createdAt)}</span>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Description</p>
            <p className="whitespace-pre-wrap text-slate-800">{inquiry.description}</p>
          </div>
        </CardContent>
      </Card>

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
        <div className="flex gap-2">
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
    </div>
  );
}
