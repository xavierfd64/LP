import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getBusinessSettings } from "@/lib/business-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MESSENGER_CATEGORIES } from "@/lib/messenger-events";
import { ProviderForm } from "./provider-form";
import { TestMessengerForm } from "./test-messenger-form";
import { MasterSwitchToggle } from "./master-switch-toggle";
import { EventToggle } from "./event-toggle";

export default async function MessengerSettingsPage() {
  await requireRole(["ADMIN"]);
  const settings = await getBusinessSettings();
  const overrides = (settings.messengerEventSettings as Record<string, boolean>) ?? {};
  const webhookUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/messenger/webhook`;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Messenger Notifications</h1>
        <p className="text-sm text-slate-500">
          An additional channel alongside Bell Notifications, the Chatbox, and Email — turning Messenger off never
          disables the underlying system, and customers must explicitly connect before receiving anything here.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Master Switch</CardTitle>
          <Badge tone={settings.messengerEnabled ? "green" : "slate"}>{settings.messengerEnabled ? "ON" : "OFF"}</Badge>
        </CardHeader>
        <CardContent>
          <MasterSwitchToggle enabled={settings.messengerEnabled} />
          <p className="mt-2 text-xs text-slate-400">
            When OFF: no Messenger messages are sent. Bell notifications, the Chatbox, and Email continue normally.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meta Page Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
            <p className="mb-1 font-medium text-slate-700">Webhook Callback URL</p>
            <p className="break-all font-mono">{webhookUrl}</p>
            <p className="mt-1">Paste this and your Verify Token into your Meta App&apos;s Messenger &gt; Webhooks setup.</p>
          </div>
          {/* Same reasoning as Email Settings — the encrypted token/secret
              ciphertext is only ever used for a truthiness check
              client-side, so it's swapped for a plain marker before
              crossing the server/client boundary. */}
          <ProviderForm
            settings={{
              ...settings,
              messengerPageAccessTokenEnc: settings.messengerPageAccessTokenEnc ? "set" : null,
              messengerAppSecretEnc: settings.messengerAppSecretEnc ? "set" : null,
            }}
          />
          <div className="border-t border-slate-100 pt-3">
            <TestMessengerForm />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Update Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {MESSENGER_CATEGORIES.map((c) => (
            <div key={c.key} className="flex items-center justify-between rounded border border-slate-100 px-3 py-1.5 text-sm">
              <span>{c.label}</span>
              <EventToggle category={c.key} enabled={overrides[c.key] !== false} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Link href="/admin/messenger-log">
        <Button variant="outline">View Messenger Log</Button>
      </Link>
    </div>
  );
}
