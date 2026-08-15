import { cache } from "react";
import { prisma } from "@/lib/prisma";

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
};

/**
 * Cached per request-render. The migration seeds the singleton row, but this
 * still falls back gracefully (rather than throwing) if it's ever missing —
 * e.g. a database restored from a backup taken before that migration ran.
 */
export const getBusinessSettings = cache(async (): Promise<BusinessSettings> => {
  const row = await prisma.businessSettings.findUnique({ where: { id: "default" } });
  return row ?? FALLBACK;
});

/** Formats the address fields into one display line, skipping empty parts. */
export function formatBusinessAddress(settings: BusinessSettings): string | null {
  const parts = [settings.addressLine, settings.city, settings.province, settings.postalCode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
