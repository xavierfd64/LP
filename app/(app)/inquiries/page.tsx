import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export default async function InquiriesPage() {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const where = isStaffLike ? {} : { customerId: (await getCurrentCustomer(user.id)).id };

  const inquiries = await prisma.inquiry.findMany({
    where,
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isStaffLike ? "Inquiries" : "My Inquiries"}</h1>
          <p className="text-sm text-slate-500">Customer requests before a quotation is prepared.</p>
        </div>
        <Link href="/inquiries/new">
          <Button>New Inquiry</Button>
        </Link>
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              {isStaffLike && <TH>Customer</TH>}
              <TH>Product</TH>
              <TH>Qty</TH>
              <TH>Status</TH>
              <TH>Submitted</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {inquiries.map((inq) => (
              <TR key={inq.id}>
                {isStaffLike && <TD>{inq.customer.name}</TD>}
                <TD>{inq.desiredProduct}</TD>
                <TD>{inq.roughQty ?? "—"}</TD>
                <TD>
                  <StatusBadge status={inq.status} />
                </TD>
                <TD>{formatDate(inq.createdAt)}</TD>
                <TD>
                  <Link href={`/inquiries/${inq.id}`} className="text-sm font-medium text-slate-900 underline">
                    View
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {inquiries.length === 0 && <EmptyState label="No inquiries yet." />}
      </Card>
    </div>
  );
}
