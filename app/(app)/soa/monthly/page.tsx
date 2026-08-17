import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { findCustomersWithOutstandingBalance, resolveSoaPeriod } from "@/lib/soa";
import { MonthYearForm } from "./month-year-form";
import { GenerateAllButton } from "./generate-all-button";
import { GenerateSoaForCustomerButton } from "./generate-soa-for-customer-button";

const STATUS_TONE = { CURRENT: "blue", DUE: "yellow", OVERDUE: "red" } as const;

export default async function MonthlySoaPage({ searchParams }: PageProps<"/soa/monthly">) {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "SOA_VIEW"))) redirect("/dashboard");
  const canGenerate = user.role === "ADMIN" || (await can(user, "SOA_GENERATE"));

  const sp = await searchParams;
  const now = new Date();
  const month = typeof sp.month === "string" ? Number(sp.month) : now.getMonth() + 1;
  const year = typeof sp.year === "string" ? Number(sp.year) : now.getFullYear();

  const range = resolveSoaPeriod({ type: "monthly", month, year });
  const customers = await findCustomersWithOutstandingBalance(range.end);

  const statementsThisMonth = await prisma.statementOfAccount.findMany({
    where: { customerId: { in: customers.map((c) => c.customer.id) }, periodStart: range.start, periodEnd: range.end },
    select: { customerId: true },
  });
  const generatedCustomerIds = new Set(statementsThisMonth.map((s) => s.customerId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Monthly SOA</h1>
          <p className="text-sm text-slate-500">
            Customers with an outstanding balance as of {formatDate(new Date(range.end.getTime() - 1))} — {range.label}.
          </p>
        </div>
        {canGenerate && customers.length > 0 && <GenerateAllButton month={month} year={year} />}
      </div>

      <MonthYearForm month={month} year={year} />

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Customer Name</TH>
              <TH>Outstanding Balance</TH>
              <TH>Last Payment</TH>
              <TH>Overdue Amount</TH>
              <TH>Status</TH>
              <TH>SOA Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {customers.map((c) => (
              <TR key={c.customer.id}>
                <TD className="font-medium text-slate-900">
                  <Link href={`/soa/customer/${c.customer.id}`} className="underline">
                    {c.customer.name}
                  </Link>
                </TD>
                <TD>{formatCurrency(c.outstandingBalance)}</TD>
                <TD className="text-sm text-slate-500">{c.lastPaymentDate ? formatDate(c.lastPaymentDate) : "—"}</TD>
                <TD>{c.overdueAmount > 0 ? formatCurrency(c.overdueAmount) : "—"}</TD>
                <TD>
                  <Badge tone={STATUS_TONE[c.balanceStatus]}>{c.balanceStatus}</Badge>
                </TD>
                <TD>
                  <Badge tone={generatedCustomerIds.has(c.customer.id) ? "green" : "slate"}>
                    {generatedCustomerIds.has(c.customer.id) ? "Generated" : "Not Generated"}
                  </Badge>
                </TD>
                <TD>{canGenerate && <GenerateSoaForCustomerButton customerId={c.customer.id} month={month} year={year} />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {customers.length === 0 && <EmptyState label="No customers with an outstanding balance for this period." />}
      </Card>
    </div>
  );
}
