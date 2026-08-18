import { cache } from "react";
import { prisma } from "@/lib/prisma";

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
};

/**
 * Cached per request-render. Falls back gracefully (rather than throwing) if
 * the row is missing — e.g. a database restored from a backup taken before
 * the migration ran — or if the database isn't reachable at all, which
 * happens during `next build`'s static prerendering step in deploy
 * pipelines that don't bring the database up until container runtime.
 */
export const getBusinessSettings = cache(async (): Promise<BusinessSettings> => {
  try {
    const row = await prisma.businessSettings.findUnique({ where: { id: "default" } });
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
