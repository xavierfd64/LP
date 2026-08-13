import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InquiryForm } from "./inquiry-form";

export default async function NewInquiryPage() {
  const user = await requireUser();
  const isStaffLike = user.role === "STAFF" || user.role === "ADMIN";

  const customers = isStaffLike
    ? await prisma.customer.findMany({ select: { id: true, name: true, companyName: true }, orderBy: { name: "asc" } })
    : undefined;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">New Inquiry</h1>
      <Card>
        <CardHeader>
          <CardTitle>Tell us what you need</CardTitle>
        </CardHeader>
        <CardContent>
          <InquiryForm customers={customers} />
        </CardContent>
      </Card>
    </div>
  );
}
