import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SoaLookup } from "./soa-lookup";

export default async function StatementOfAccountHubPage() {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "SOA_VIEW"))) redirect("/dashboard");

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Statement of Account</h1>
          <p className="text-sm text-slate-500">
            Select a customer to view their financial activity and generate a consolidated statement.
          </p>
        </div>
        <Link href="/soa/monthly">
          <Button variant="outline">Monthly SOA</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Find a Customer</CardTitle>
        </CardHeader>
        <CardContent>
          <SoaLookup />
        </CardContent>
      </Card>
    </div>
  );
}
