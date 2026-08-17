import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { CustomersList } from "./customers-list";

export default async function CustomersPage() {
  const user = await requireRole(["STAFF", "ADMIN"]);
  if (user.role === "STAFF" && !(await can(user, "CUSTOMER_VIEW"))) redirect("/dashboard");
  const canCreate = user.role === "ADMIN" || (await can(user, "CUSTOMER_CREATE"));

  const customers = await prisma.customer.findMany({
    take: 25,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
        <p className="mt-1 text-sm text-slate-500">
          Customer records exist independently of login accounts — search to find a repeat customer, or add a new
          walk-in record.
        </p>
      </div>
      <Card>
        <CustomersList
          canCreate={canCreate}
          initialCustomers={customers.map((c) => ({
            id: c.id,
            displayId: c.displayId,
            name: c.name,
            companyName: c.companyName,
            email: c.email ?? c.user?.email ?? null,
            contactNumber: c.contactNumber,
            hasLogin: !!c.userId,
            isQualifiedForTerms: c.isQualifiedForTerms,
          }))}
        />
      </Card>
    </div>
  );
}
