"use client";

import { useActionState } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { updateMessengerProviderAction } from "@/app/actions/messenger-settings";
import type { BusinessSettings } from "@/lib/business-settings";

export function ProviderForm({ settings }: { settings: BusinessSettings }) {
  const [error, formAction, pending] = useActionState(updateMessengerProviderAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="messengerPageId">Facebook Page ID</Label>
          <Input id="messengerPageId" name="messengerPageId" required defaultValue={settings.messengerPageId ?? ""} />
        </div>
        <div>
          <Label htmlFor="messengerVerifyToken">Webhook Verify Token</Label>
          <Input
            id="messengerVerifyToken"
            name="messengerVerifyToken"
            required
            defaultValue={settings.messengerVerifyToken ?? ""}
            placeholder="Any string you choose"
          />
        </div>
        <div>
          <Label htmlFor="messengerPageAccessToken">Page Access Token</Label>
          <Input
            id="messengerPageAccessToken"
            name="messengerPageAccessToken"
            type="password"
            placeholder={settings.messengerPageAccessTokenEnc ? "•••••••• (unchanged)" : "From your Meta App's Messenger settings"}
          />
        </div>
        <div>
          <Label htmlFor="messengerAppSecret">App Secret (optional, recommended)</Label>
          <Input
            id="messengerAppSecret"
            name="messengerAppSecret"
            type="password"
            placeholder={settings.messengerAppSecretEnc ? "•••••••• (unchanged)" : "Verifies incoming webhook requests"}
          />
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save Settings"}
      </Button>
    </form>
  );
}
