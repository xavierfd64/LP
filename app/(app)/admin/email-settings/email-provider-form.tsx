"use client";

import { useActionState, useState } from "react";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { updateEmailProviderAction } from "@/app/actions/email-settings";
import type { BusinessSettings, EmailProvider } from "@/lib/business-settings";

const PROVIDER_HINT: Record<string, string> = {
  GMAIL: "Use an App Password, not your normal Google account password (Google Account → Security → App Passwords).",
  YAHOO: "Use an App Password (Yahoo Account → Account Security → Generate app password).",
  OUTLOOK: "Use an App Password if your Microsoft account has 2FA enabled, otherwise your account password.",
  CUSTOM_SMTP: "Enter your mail provider's SMTP host, port, and credentials directly.",
};

export function EmailProviderForm({ settings }: { settings: BusinessSettings }) {
  const [error, formAction, pending] = useActionState(updateEmailProviderAction, undefined);
  const [provider, setProvider] = useState<EmailProvider>(settings.emailProvider ?? "GMAIL");

  return (
    <form action={formAction} className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="emailProvider">Provider</Label>
        <Select id="emailProvider" name="emailProvider" value={provider} onChange={(e) => setProvider(e.target.value as EmailProvider)}>
          <option value="GMAIL">Gmail</option>
          <option value="YAHOO">Yahoo Mail</option>
          <option value="OUTLOOK">Outlook / Live / Microsoft</option>
          <option value="CUSTOM_SMTP">Custom SMTP / Business Email</option>
        </Select>
        <p className="mt-1 text-xs text-slate-400">{PROVIDER_HINT[provider]}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="emailSenderName">Sender Name</Label>
          <Input id="emailSenderName" name="emailSenderName" defaultValue={settings.emailSenderName ?? ""} placeholder="LP Printing" />
        </div>
        <div>
          <Label htmlFor="emailSenderAddress">Sender / Login Email</Label>
          <Input
            id="emailSenderAddress"
            name="emailSenderAddress"
            type="email"
            required
            defaultValue={settings.emailSenderAddress ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="emailSmtpUsername">SMTP Username (if different)</Label>
          <Input id="emailSmtpUsername" name="emailSmtpUsername" defaultValue={settings.emailSmtpUsername ?? ""} />
        </div>
        <div>
          <Label htmlFor="emailSmtpPassword">Password / App Password</Label>
          <Input id="emailSmtpPassword" name="emailSmtpPassword" type="password" placeholder={settings.emailSmtpPasswordEnc ? "•••••••• (unchanged)" : ""} />
        </div>
      </div>

      {provider === "CUSTOM_SMTP" && (
        <div className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="emailSmtpHost">SMTP Host</Label>
            <Input id="emailSmtpHost" name="emailSmtpHost" defaultValue={settings.emailSmtpHost ?? ""} placeholder="smtp.yourdomain.com" />
          </div>
          <div>
            <Label htmlFor="emailSmtpPort">Port</Label>
            <Input id="emailSmtpPort" name="emailSmtpPort" type="number" defaultValue={settings.emailSmtpPort ?? 587} />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <input type="checkbox" id="emailSmtpSecure" name="emailSmtpSecure" defaultChecked={settings.emailSmtpSecure} className="h-4 w-4" />
            <Label htmlFor="emailSmtpSecure" className="mb-0">
              Use TLS/SSL
            </Label>
          </div>
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save Settings"}
      </Button>
    </form>
  );
}
