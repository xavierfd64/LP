import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PromotionForm } from "../promotion-form";

export default async function NewPromotionPage() {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "SERVICE_MANAGE"))) redirect("/admin/promotions");

  const services = await prisma.service.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">New Promotion</h1>
      <Card>
        <CardHeader>
          <CardTitle>Promotion details</CardTitle>
        </CardHeader>
        <CardContent>
          <PromotionForm services={services} />
        </CardContent>
      </Card>
    </div>
  );
}
