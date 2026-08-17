import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EMAIL_EVENTS } from "@/lib/email-events";

export default async function EmailTemplatesPage() {
  await requireRole(["ADMIN"]);
  const customized = await prisma.emailTemplate.findMany({ select: { key: true } });
  const customizedKeys = new Set(customized.map((t) => t.key));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Email Templates</h1>
        <p className="text-sm text-slate-500">
          Editable subject/body per event. An event with no customization uses a sensible built-in default.
        </p>
      </div>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Event</TH>
              <TH>Category</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {Object.entries(EMAIL_EVENTS).map(([key, v]) => (
              <TR key={key}>
                <TD className="font-medium text-slate-900">{v.label}</TD>
                <TD className="text-sm text-slate-500">{v.category}</TD>
                <TD>
                  <Badge tone={customizedKeys.has(key) ? "green" : "slate"}>
                    {customizedKeys.has(key) ? "Customized" : "Default"}
                  </Badge>
                </TD>
                <TD>
                  <Link href={`/admin/email-settings/templates/${key}`} className="text-sm font-medium text-brand-600 underline">
                    Edit
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
