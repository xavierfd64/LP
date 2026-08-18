import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getBusinessSettings } from "@/lib/business-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EMAIL_EVENTS } from "@/lib/email-events";
import { EmailProviderForm } from "./email-provider-form";
import { TestEmailForm } from "./test-email-form";
import { MasterSwitchToggle } from "./master-switch-toggle";
import { EventToggle } from "./event-toggle";

export default async function EmailSettingsPage() {
  await requireRole(["ADMIN"]);
  const settings = await getBusinessSettings();
  const overrides = (settings.emailEventSettings as Record<string, boolean>) ?? {};

  const categories = Array.from(new Set(Object.values(EMAIL_EVENTS).map((e) => e.category)));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Email Notifications</h1>
        <p className="text-sm text-slate-500">
          An additional channel on top of Bell Notifications and the Chatbox — turning email off never disables the
          underlying system.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Master Switch</CardTitle>
          <Badge tone={settings.emailEnabled ? "green" : "slate"}>{settings.emailEnabled ? "ON" : "OFF"}</Badge>
        </CardHeader>
        <CardContent>
          <MasterSwitchToggle enabled={settings.emailEnabled} />
          <p className="mt-2 text-xs text-slate-400">
            When OFF: no automatic external emails are sent. Bell notifications, the Chatbox, and every transaction
            continue normally.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Provider:</span>
            <span className="font-medium">{settings.emailProvider ?? "Not configured"}</span>
            <span className="text-slate-500">Sender:</span>
            <span className="font-medium">{settings.emailSenderAddress ?? "—"}</span>
            {settings.emailLastTestAt && (
              <Badge tone={settings.emailLastTestOk ? "green" : "red"}>
                {settings.emailLastTestOk ? "Connected" : "Last test failed"}
              </Badge>
            )}
          </div>
          {/* The encrypted password ciphertext is only ever used for a
              truthiness check ("unchanged" placeholder) client-side — it
              must never actually reach the browser, so it's swapped for a
              plain marker string before this crosses the server/client
              boundary. */}
          <EmailProviderForm settings={{ ...settings, emailSmtpPasswordEnc: settings.emailSmtpPasswordEnc ? "set" : null }} />
          <div className="border-t border-slate-100 pt-3">
            <TestEmailForm />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Individual Email Events</CardTitle>
          <Link href="/admin/email-settings/templates" className="text-sm font-medium text-brand-600 underline">
            Edit Templates
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories.map((category) => (
            <div key={category}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{category}</p>
              <div className="space-y-1">
                {Object.entries(EMAIL_EVENTS)
                  .filter(([, v]) => v.category === category)
                  .map(([key, v]) => (
                    <div key={key} className="flex items-center justify-between rounded border border-slate-100 px-3 py-1.5 text-sm">
                      <span>{v.label}</span>
                      <EventToggle eventKey={key} enabled={overrides[key] !== false} />
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Link href="/admin/email-log">
        <Button variant="outline">View Email Log</Button>
      </Link>
    </div>
  );
}
