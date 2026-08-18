"use client";

import { useActionState } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { updateAuthProviderSettingsAction } from "@/app/actions/auth-settings";
import type { BusinessSettings } from "@/lib/business-settings";

export function ProviderForm({ settings }: { settings: BusinessSettings }) {
  const [error, formAction, pending] = useActionState(updateAuthProviderSettingsAction, undefined);

  return (
    <form action={formAction} className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Google</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="googleClientId">Client ID</Label>
            <Input id="googleClientId" name="googleClientId" defaultValue={settings.googleClientId ?? ""} placeholder="xxxx.apps.googleusercontent.com" />
          </div>
          <div>
            <Label htmlFor="googleClientSecret">Client Secret</Label>
            <Input
              id="googleClientSecret"
              name="googleClientSecret"
              type="password"
              placeholder={settings.googleClientSecretEnc ? "•••••••• (unchanged)" : "From Google Cloud Console"}
            />
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Facebook</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="facebookClientId">App ID</Label>
            <Input id="facebookClientId" name="facebookClientId" defaultValue={settings.facebookClientId ?? ""} placeholder="From Meta for Developers" />
          </div>
          <div>
            <Label htmlFor="facebookClientSecret">App Secret</Label>
            <Input
              id="facebookClientSecret"
              name="facebookClientSecret"
              type="password"
              placeholder={settings.facebookClientSecretEnc ? "•••••••• (unchanged)" : "From Meta for Developers"}
            />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save Settings"}
      </Button>
    </form>
  );
}
