import { requireRole } from "@/lib/session";
import { getBusinessSettings } from "@/lib/business-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProviderForm } from "./provider-form";

function providerStatus(dbConfigured: boolean, envConfigured: boolean): { label: string; tone: "green" | "blue" | "slate" } {
  if (dbConfigured) return { label: "Configured (Settings)", tone: "green" };
  if (envConfigured) return { label: "Configured (Environment)", tone: "blue" };
  return { label: "Not Configured", tone: "slate" };
}

export default async function AuthSettingsPage() {
  await requireRole(["ADMIN"]);
  const settings = await getBusinessSettings();
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";

  const googleDbConfigured = !!(settings.googleClientId && settings.googleClientSecretEnc);
  const googleEnvConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const facebookDbConfigured = !!(settings.facebookClientId && settings.facebookClientSecretEnc);
  const facebookEnvConfigured = !!(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET);

  const google = providerStatus(googleDbConfigured, googleEnvConfigured);
  const facebook = providerStatus(facebookDbConfigured, facebookEnvConfigured);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Authentication Settings</h1>
        <p className="text-sm text-slate-500">
          Lets customers sign up and sign in with Google or Facebook, in addition to email/password. Staff, Production, and
          Admin accounts always sign in with email/password only.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Google &amp; Facebook Sign-In</CardTitle>
          <div className="flex gap-2">
            <Badge tone={google.tone}>Google: {google.label}</Badge>
            <Badge tone={facebook.tone}>Facebook: {facebook.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
            <p className="mb-1 font-medium text-slate-700">Redirect URIs</p>
            <p className="break-all font-mono">{base}/api/auth/callback/google</p>
            <p className="break-all font-mono">{base}/api/auth/callback/facebook</p>
            <p className="mt-2">
              Register these exactly in Google Cloud Console (APIs &amp; Services → Credentials) and Meta for Developers
              (Facebook Login → Settings).
            </p>
          </div>

          {/* Same reasoning as Email/Messenger Settings — the encrypted
              secret ciphertext is only ever used for a truthiness check
              client-side, so it's swapped for a plain marker before
              crossing the server/client boundary. */}
          <ProviderForm
            settings={{
              ...settings,
              googleClientSecretEnc: settings.googleClientSecretEnc ? "set" : null,
              facebookClientSecretEnc: settings.facebookClientSecretEnc ? "set" : null,
            }}
          />

          <p className="border-t border-slate-100 pt-3 text-xs text-slate-400">
            These settings take precedence over the GOOGLE_CLIENT_ID/SECRET and FACEBOOK_CLIENT_ID/SECRET environment
            variables when set. Leaving a Client ID blank falls back to the environment variable for that provider, if one
            is set on this deployment.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
