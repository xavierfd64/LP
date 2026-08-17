import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EMAIL_EVENTS, EMAIL_VARIABLES, defaultSubjectFor, defaultBodyFor, type EmailEventKey } from "@/lib/email-events";
import { TemplateForm } from "./template-form";

export default async function EmailTemplateEditPage({ params }: PageProps<"/admin/email-settings/templates/[key]">) {
  await requireRole(["ADMIN"]);
  const { key } = await params;
  if (!(key in EMAIL_EVENTS)) notFound();
  const eventKey = key as EmailEventKey;

  const row = await prisma.emailTemplate.findUnique({ where: { key: eventKey } });
  const subject = row?.subject ?? defaultSubjectFor(eventKey);
  const bodyHtml = row?.bodyHtml ?? defaultBodyFor(eventKey);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{EMAIL_EVENTS[eventKey].label}</h1>
        <p className="text-sm text-slate-500">{EMAIL_EVENTS[eventKey].category}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available Variables</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {EMAIL_VARIABLES.map((v) => (
              <code key={v} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                {`{{${v}}}`}
              </code>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Template</CardTitle>
        </CardHeader>
        <CardContent>
          <TemplateForm eventKey={eventKey} subject={subject} bodyHtml={bodyHtml} />
        </CardContent>
      </Card>
    </div>
  );
}
