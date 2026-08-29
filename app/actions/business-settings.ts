"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { saveUploadedFile, UploadRejectedError } from "@/lib/upload";
import { BUSINESS_SETTINGS_TAG } from "@/lib/business-settings";

/**
 * Only http(s) URLs are accepted for a pasted logo/favicon URL — rejects
 * javascript:/data:/vbscript: and anything else that isn't a normal image
 * link (spec item 57's "prevent HTML/script injection" for URL inputs).
 */
function isSafeImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const settingsSchema = z.object({
  businessName: z.string().min(1, "Business name is required."),
  tagline: z.string().optional(),
  description: z.string().optional(),
  contactNumber: z.string().optional(),
  email: z.string().email("Enter a valid email.").optional().or(z.literal("")),
  facebookUrl: z.string().optional(),
  website: z.string().optional(),
  addressLine: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  assignmentMode: z.enum(["MANUAL", "AUTOMATIC", "MANUAL_WITH_AUTO_FALLBACK"]),
  paymentInstructions: z.string().optional(),
  timezone: z.string().min(1, "Select a timezone."),
});

/**
 * A real IANA timezone name Node's Intl can resolve — rejects garbage
 * input rather than trusting the <select>'s value blindly (defense in
 * depth: a tampered form post shouldn't be able to set process.env.TZ,
 * read by instrumentation.ts on next restart, to something invalid).
 */
function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function emptyToUndefined(v: FormDataEntryValue | null) {
  const s = (v as string) || "";
  return s.trim() === "" ? undefined : s;
}

export async function updateBusinessSettingsAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);

  const parsed = settingsSchema.safeParse({
    businessName: formData.get("businessName"),
    tagline: emptyToUndefined(formData.get("tagline")),
    description: emptyToUndefined(formData.get("description")),
    contactNumber: emptyToUndefined(formData.get("contactNumber")),
    email: emptyToUndefined(formData.get("email")) ?? "",
    facebookUrl: emptyToUndefined(formData.get("facebookUrl")),
    website: emptyToUndefined(formData.get("website")),
    addressLine: emptyToUndefined(formData.get("addressLine")),
    city: emptyToUndefined(formData.get("city")),
    province: emptyToUndefined(formData.get("province")),
    postalCode: emptyToUndefined(formData.get("postalCode")),
    assignmentMode: formData.get("assignmentMode"),
    paymentInstructions: emptyToUndefined(formData.get("paymentInstructions")),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";
  if (!isValidTimeZone(parsed.data.timezone)) return "That timezone isn't recognized.";

  const data: Record<string, string | null | boolean> = {
    businessName: parsed.data.businessName,
    tagline: parsed.data.tagline ?? null,
    description: parsed.data.description ?? null,
    contactNumber: parsed.data.contactNumber ?? null,
    email: parsed.data.email || null,
    facebookUrl: parsed.data.facebookUrl ?? null,
    website: parsed.data.website ?? null,
    addressLine: parsed.data.addressLine ?? null,
    city: parsed.data.city ?? null,
    province: parsed.data.province ?? null,
    postalCode: parsed.data.postalCode ?? null,
    assignmentMode: parsed.data.assignmentMode,
    paymentInstructions: parsed.data.paymentInstructions ?? null,
    timezone: parsed.data.timezone,
    // A plain (unregistered) HTML checkbox only appears in the submitted
    // FormData at all when checked — there's no "off" value to read, so
    // presence-of-key is the checked state, not zod-parsed like the rest
    // of this form's fields.
    autoAssignGraphicArtist: formData.get("autoAssignGraphicArtist") === "true",
  };

  // Branding source (spec items 48/49): each of logo/favicon independently
  // resolves from an Upload, a pasted Image URL, or "Default" (clears it).
  // Upload remains supported for environments with persistent storage, but
  // Image URL is the first-class, Render-safe option — this app's own
  // /public/uploads directory does not survive a redeploy on this
  // container's ephemeral filesystem, which is the exact cause of a
  // previously-observed broken logo image after a redeploy (spec item 53).
  const logoSource = formData.get("logoSource");
  if (logoSource === "default") {
    data.logoPath = null;
  } else if (logoSource === "url") {
    const logoUrl = (formData.get("logoUrl") as string | null)?.trim();
    if (logoUrl) {
      if (!isSafeImageUrl(logoUrl)) return "Logo URL must be a valid http:// or https:// link.";
      data.logoPath = logoUrl;
    }
  } else if (logoSource === "upload") {
    const logoFile = formData.get("logo") as File | null;
    if (logoFile && logoFile.size > 0) {
      try {
        const saved = await saveUploadedFile(logoFile, "image");
        data.logoPath = saved.path;
      } catch (e) {
        if (e instanceof UploadRejectedError) return e.message;
        throw e;
      }
    }
  }

  const faviconSource = formData.get("faviconSource");
  if (faviconSource === "default") {
    data.faviconPath = null;
  } else if (faviconSource === "url") {
    const faviconUrl = (formData.get("faviconUrl") as string | null)?.trim();
    if (faviconUrl) {
      if (!isSafeImageUrl(faviconUrl)) return "Favicon URL must be a valid http:// or https:// link.";
      data.faviconPath = faviconUrl;
    }
  } else if (faviconSource === "upload") {
    const faviconFile = formData.get("favicon") as File | null;
    if (faviconFile && faviconFile.size > 0) {
      try {
        const saved = await saveUploadedFile(faviconFile, "image");
        data.faviconPath = saved.path;
      } catch (e) {
        if (e instanceof UploadRejectedError) return e.message;
        throw e;
      }
    }
  }

  await prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  updateTag(BUSINESS_SETTINGS_TAG);

  await logAudit(user.id, "BUSINESS_SETTINGS_UPDATED", "BusinessSettings", "default", data);

  redirect("/admin/settings");
}
