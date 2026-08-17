import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServiceForm } from "../service-form";

export default async function EditServicePage({ params }: PageProps<"/admin/services/[id]">) {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";
  if (!isStaffLike) redirect("/dashboard");
  if (user.role === "STAFF" && !(await can(user, "SERVICE_MANAGE"))) redirect("/admin/services");

  const { id } = await params;
  const [service, templates] = await Promise.all([
    prisma.service.findUnique({ where: { id } }),
    prisma.workflowTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!service) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Edit Service</h1>
      <Card>
        <CardHeader>
          <CardTitle>Service details</CardTitle>
        </CardHeader>
        <CardContent>
          <ServiceForm
            templates={templates}
            service={{
              id: service.id,
              name: service.name,
              description: service.description,
              category: service.category,
              workflowTemplateId: service.workflowTemplateId,
              specFields: (service.specFields as string[]) ?? [],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
