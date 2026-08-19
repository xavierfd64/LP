"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { THEMES, FONT_FAMILIES, isSafeHexColor, type TokenOverrides, type FontFamilyKey } from "@/lib/themes";
import { BUSINESS_SETTINGS_TAG } from "@/lib/business-settings";

/** Switching themes only ever touches BusinessSettings.activeTheme — never any other table (spec items 19/29/30/48). Color/font customization is a separate, orthogonal setting that persists across theme switches on purpose (an Admin's chosen Primary color shouldn't silently reset just because they preview a different theme). */
export async function activateThemeAction(slug: string) {
  const user = await requireRole(["ADMIN"]);
  if (!THEMES[slug]) throw new Error("Unknown theme.");

  await prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default", activeTheme: slug },
    update: { activeTheme: slug },
  });
  updateTag(BUSINESS_SETTINGS_TAG);
  await logAudit(user.id, "THEME_ACTIVATED", "BusinessSettings", "default", { theme: slug });
  redirect("/admin/themes");
}

const colorField = z
  .string()
  .refine((v) => isSafeHexColor(v), { message: "Colors must be a valid #rrggbb hex value." });

const customizationSchema = z.object({
  primary: colorField,
  secondary: colorField,
  accent: colorField,
  success: colorField,
  warning: colorField,
  error: colorField,
  info: colorField,
  fontFamily: z.enum(Object.keys(FONT_FAMILIES) as [FontFamilyKey, ...FontFamilyKey[]]),
});

export async function updateThemeCustomizationAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);

  const parsed = customizationSchema.safeParse({
    primary: formData.get("primary"),
    secondary: formData.get("secondary"),
    accent: formData.get("accent"),
    success: formData.get("success"),
    warning: formData.get("warning"),
    error: formData.get("error"),
    info: formData.get("info"),
    fontFamily: formData.get("fontFamily"),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input.";

  const { fontFamily, ...overrides } = parsed.data;
  const tokenOverrides: TokenOverrides = overrides;

  await prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default", themeColorOverrides: tokenOverrides, themeFontFamily: fontFamily },
    update: { themeColorOverrides: tokenOverrides, themeFontFamily: fontFamily },
  });
  updateTag(BUSINESS_SETTINGS_TAG);
  await logAudit(user.id, "THEME_CUSTOMIZATION_UPDATED", "BusinessSettings", "default", { fontFamily });

  redirect("/admin/themes");
}

export async function resetThemeCustomizationAction() {
  const user = await requireRole(["ADMIN"]);

  const settings = await prisma.businessSettings.findUnique({ where: { id: "default" } });
  const activeTheme = THEMES[settings?.activeTheme ?? "2026"] ?? THEMES["2026"];

  await prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default", themeColorOverrides: {}, themeFontFamily: activeTheme.defaultTokens.fontFamily },
    update: { themeColorOverrides: {}, themeFontFamily: activeTheme.defaultTokens.fontFamily },
  });
  updateTag(BUSINESS_SETTINGS_TAG);
  await logAudit(user.id, "THEME_CUSTOMIZATION_RESET", "BusinessSettings", "default", { theme: activeTheme.slug });

  redirect("/admin/themes");
}
