import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export const BUSINESS_SETTINGS_TAG = "business-settings";

export type StaffAssignmentMode = "MANUAL" | "AUTOMATIC" | "MANUAL_WITH_AUTO_FALLBACK";
export type EmailProvider = "GMAIL" | "YAHOO" | "OUTLOOK" | "CUSTOM_SMTP";

export type BusinessSettings = {
  id: string;
  businessName: string;
  tagline: string | null;
  description: string | null;
  logoPath: string | null;
  faviconPath: string | null;
  contactNumber: string | null;
  email: string | null;
  facebookUrl: string | null;
  website: string | null;
  addressLine: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  assignmentMode: StaffAssignmentMode;
  autoAssignGraphicArtist: boolean;
  paymentInstructions: string | null;
  emailEnabled: boolean;
  emailProvider: EmailProvider | null;
  emailSenderName: string | null;
  emailSenderAddress: string | null;
  emailSmtpHost: string | null;
  emailSmtpPort: number | null;
  emailSmtpSecure: boolean;
  emailSmtpUsername: string | null;
  emailSmtpPasswordEnc: string | null;
  emailEventSettings: unknown;
  emailLastTestAt: Date | null;
  emailLastTestOk: boolean | null;
  messengerEnabled: boolean;
  messengerPageId: string | null;
  messengerPageAccessTokenEnc: string | null;
  messengerVerifyToken: string | null;
  messengerAppSecretEnc: string | null;
  messengerEventSettings: unknown;
  googleClientId: string | null;
  googleClientSecretEnc: string | null;
  facebookClientId: string | null;
  facebookClientSecretEnc: string | null;
  activeTheme: string;
  themeColorOverrides: unknown;
  themeFontFamily: string;
  timezone: string;
};

const FALLBACK: BusinessSettings = {
  id: "default",
  businessName: "LP Printing",
  tagline: "Business Management System",
  description: null,
  logoPath: null,
  faviconPath: null,
  contactNumber: null,
  email: null,
  facebookUrl: null,
  website: null,
  addressLine: null,
  city: null,
  province: null,
  postalCode: null,
  assignmentMode: "MANUAL",
  autoAssignGraphicArtist: false,
  paymentInstructions: null,
  emailEnabled: false,
  emailProvider: null,
  emailSenderName: null,
  emailSenderAddress: null,
  emailSmtpHost: null,
  emailSmtpPort: null,
  emailSmtpSecure: true,
  emailSmtpUsername: null,
  emailSmtpPasswordEnc: null,
  emailEventSettings: {},
  emailLastTestAt: null,
  emailLastTestOk: null,
  messengerEnabled: false,
  messengerPageId: null,
  messengerPageAccessTokenEnc: null,
  messengerVerifyToken: null,
  messengerAppSecretEnc: null,
  messengerEventSettings: {},
  googleClientId: null,
  googleClientSecretEnc: null,
  facebookClientId: null,
  facebookClientSecretEnc: null,
  activeTheme: "2026",
  themeColorOverrides: {},
  themeFontFamily: "montserrat",
  timezone: "Asia/Manila",
};

/**
 * BusinessSettings is read by the ROOT layout on every single request
 * (branding + the live theme `<style>` override), so this fetch sits
 * directly on the critical path of every page load and every Server
 * Action redirect. `unstable_cache` keeps it resolving from Next's data
 * cache instead of a real Postgres round-trip on every request — every
 * action mutating BusinessSettings (theme.ts, business-settings.ts,
 * email-settings.ts, messenger-settings.ts, auth-settings.ts, email.ts's
 * token-refresh persistence) calls `revalidateTag(BUSINESS_SETTINGS_TAG)`
 * so a change is visible on the very next request, not after some fixed
 * delay — the `revalidate: 60` below is only a safety net in case a future
 * mutation site forgets to invalidate, not the primary invalidation path.
 * `cache()` on top dedupes the (already-cheap) call across the several
 * places a single request reads it (generateMetadata, RootLayout, Shell).
 */
const fetchBusinessSettingsRow = unstable_cache(
  async () => prisma.businessSettings.findUnique({ where: { id: "default" } }),
  ["business-settings-row"],
  { tags: [BUSINESS_SETTINGS_TAG], revalidate: 60 }
);

/**
 * Falls back gracefully (rather than throwing) if the row is missing —
 * e.g. a database restored from a backup taken before the migration ran —
 * or if the database isn't reachable at all, which happens during
 * `next build`'s static prerendering step in deploy pipelines that don't
 * bring the database up until container runtime.
 */
export const getBusinessSettings = cache(async (): Promise<BusinessSettings> => {
  try {
    const row = await fetchBusinessSettingsRow();
    return row ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
});

/** Formats the address fields into one display line, skipping empty parts. */
export function formatBusinessAddress(settings: BusinessSettings): string | null {
  const parts = [settings.addressLine, settings.city, settings.province, settings.postalCode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
