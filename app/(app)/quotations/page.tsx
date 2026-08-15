import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getCurrentCustomer } from "@/lib/current-customer";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function QuotationsPage() {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const where = isStaffLike ? {} : { customerId: (await getCurrentCustomer(user.id)).id };

  const quotations = await prisma.quotation.findMany({
    where,
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isStaffLike ? "Quotations" : "My Quotations"}</h1>
          <p className="text-sm text-slate-500">Review pricing before an order is created.</p>
        </div>
        {isStaffLike && (
          <Link href="/quotations/new">
            <Button>New Quotation</Button>
          </Link>
        )}
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Number</TH>
              {isStaffLike && <TH>Customer</TH>}
              <TH>Total</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {quotations.map((q) => (
              <TR key={q.id}>
                <TD className="font-medium text-slate-900">{q.quoteNumber}</TD>
                {isStaffLike && <TD>{q.customer.name}</TD>}
                <TD>{formatCurrency(q.total.toString())}</TD>
                <TD>
                  <StatusBadge status={q.status} />
                </TD>
                <TD>{formatDate(q.createdAt)}</TD>
                <TD>
                  <Link href={`/quotations/${q.id}`} className="text-sm font-medium text-slate-900 underline">
                    View
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {quotations.length === 0 && <EmptyState label="No quotations yet." />}
      </Card>
    </div>
  );
}
