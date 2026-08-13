import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewTemplateForm } from "./template-form";

export default async function NewWorkflowTemplatePage() {
  await requireRole(["ADMIN"]);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">New Workflow Template</h1>
      <Card>
        <CardHeader>
          <CardTitle>Define stages</CardTitle>
        </CardHeader>
        <CardContent>
          <NewTemplateForm />
        </CardContent>
      </Card>
    </div>
  );
}
