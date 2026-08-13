import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { closeInquiryAction } from "@/app/actions/inquiries";

export default async function InquiryDetailPage({ params }: PageProps<"/inquiries/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: { customer: true, quotations: true },
  });
  if (!inquiry) notFound();

  if (!isStaffLike) {
    const customer = await getCurrentCustomer(user.id);
    if (inquiry.customerId !== customer.id) redirect("/inquiries");
  }

  const closeAction = closeInquiryAction.bind(null, inquiry.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{inquiry.desiredProduct}</h1>
        <StatusBadge status={inquiry.status} />
      </div>

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

      {isStaffLike && (
        <div className="flex gap-2">
          {inquiry.status !== "CLOSED" && (
            <Link href={`/quotations/new?inquiryId=${inquiry.id}`}>
              <Button>Convert to Quotation</Button>
            </Link>
          )}
          {inquiry.status !== "CLOSED" && (
            <form action={closeAction}>
              <Button variant="outline" type="submit">
                Close Inquiry
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
