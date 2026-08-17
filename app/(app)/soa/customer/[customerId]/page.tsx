import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { computeStatementOfAccount, deriveSoaBalanceStatus } from "@/lib/soa";
import { PeriodForm } from "./period-form";
import { AdjustmentForm } from "./adjustment-form";

const STATUS_TONE = { CURRENT: "blue", DUE: "yellow", OVERDUE: "red" } as const;

export default async function CustomerSoaPage({ params }: PageProps<"/soa/customer/[customerId]">) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "SOA_VIEW"))) redirect("/dashboard");
  const canGenerate = user.role === "ADMIN" || (await can(user, "SOA_GENERATE"));

  const { customerId } = await params;
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) notFound();

  const [statements, openOrders] = await Promise.all([
    prisma.statementOfAccount.findMany({ where: { customerId }, orderBy: { generatedAt: "desc" }, take: 20 }),
    prisma.order.findMany({ where: { customerId, status: { not: "CANCELLED" } }, select: { dueDate: true } }),
  ]);

  const snapshot = await computeStatementOfAccount(customerId, new Date(0), new Date());
  const balanceStatus = deriveSoaBalanceStatus(openOrders);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
        <p className="text-sm text-slate-500">
          {customer.displayId}
          {customer.companyName ? ` · ${customer.companyName}` : ""}
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Address</p>
            <p className="text-sm text-slate-900">{customer.address || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Email</p>
            <p className="text-sm text-slate-900">{customer.email || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Contact Number</p>
            <p className="text-sm text-slate-900">{customer.contactNumber || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Facebook</p>
            <p className="text-sm text-slate-900">{customer.facebookUrl || "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-brand-600">
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Outstanding (as of today)</p>
            <p className="text-3xl font-bold text-brand-700">{formatCurrency(Math.max(snapshot.outstandingBalance, 0))}</p>
          </div>
          {snapshot.outstandingBalance > 0.01 && <Badge tone={STATUS_TONE[balanceStatus]}>{balanceStatus.replace(/_/g, " ")}</Badge>}
        </CardContent>
      </Card>

      {canGenerate && (
        <Card>
          <CardHeader>
            <CardTitle>Generate Statement of Account</CardTitle>
          </CardHeader>
          <CardContent>
            <PeriodForm customerId={customerId} />
          </CardContent>
        </Card>
      )}

      {canGenerate && (
        <Card>
          <CardHeader>
            <CardTitle>Adjustments / Credits</CardTitle>
          </CardHeader>
          <CardContent>
            <AdjustmentForm customerId={customerId} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Previous Statements</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Statement No.</TH>
              <TH>Period</TH>
              <TH>Generated</TH>
              <TH>Outstanding</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {statements.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium text-slate-900">{s.statementNumber}</TD>
                <TD className="text-sm text-slate-600">
                  {formatDate(s.periodStart)} – {formatDate(new Date(s.periodEnd.getTime() - 1))}
                </TD>
                <TD className="text-sm text-slate-500">{formatDateTime(s.generatedAt)}</TD>
                <TD>{formatCurrency(s.outstandingBalance.toString())}</TD>
                <TD>
                  <Link href={`/soa/view/${s.id}`} className="text-sm font-medium text-brand-600 underline">
                    View
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {statements.length === 0 && <EmptyState label="No statements generated yet." />}
      </Card>
    </div>
  );
}
