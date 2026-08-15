"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { saveUploadedFile } from "@/lib/upload";

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
});

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
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const data: Record<string, string | null> = {
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
  };

  const logoFile = formData.get("logo") as File | null;
  if (logoFile && logoFile.size > 0) {
    const saved = await saveUploadedFile(logoFile);
    data.logoPath = saved.path;
  }

  const faviconFile = formData.get("favicon") as File | null;
  if (faviconFile && faviconFile.size > 0) {
    const saved = await saveUploadedFile(faviconFile);
    data.faviconPath = saved.path;
  }

  await prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });

  await logAudit(user.id, "BUSINESS_SETTINGS_UPDATED", "BusinessSettings", "default", data);

  redirect("/admin/settings");
}
