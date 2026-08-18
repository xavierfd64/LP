import { getBusinessSettings } from "@/lib/business-settings";

/**
 * Which OAuth sign-in buttons should render. Google/Facebook only show up
 * once real credentials are configured — via the Admin "Authentication
 * Settings" page (BusinessSettings) or the GOOGLE_CLIENT_ID/SECRET and
 * FACEBOOK_CLIENT_ID/SECRET env vars — mirroring exactly the precedence
 * lib/auth.ts itself uses to register the providers, so this never shows
 * a button that would actually fail. Server-only (reads BusinessSettings).
 */
export async function availableOAuthProviders() {
  const settings = await getBusinessSettings();
  return {
    google: Boolean(
      (settings.googleClientId && settings.googleClientSecretEnc) ||
        (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    ),
    facebook: Boolean(
      (settings.facebookClientId && settings.facebookClientSecretEnc) ||
        (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET)
    ),
  };
}
