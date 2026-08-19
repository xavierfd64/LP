"use server";

import path from "path";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { installZipPackage } from "@/lib/package-installer";
import { THEMES } from "@/lib/themes";

const THEMES_DIR = path.join(process.cwd(), "themes");

/**
 * Admin-only ZIP theme upload (spec Part D). Validates and extracts for
 * real (see lib/package-installer.ts — manifest schema, zip-slip
 * protection, duplicate-slug rejection against both the built-in registry
 * and previously uploaded themes). Deliberately does NOT make an uploaded
 * theme activatable: this compiled Next.js app can't safely load and
 * render arbitrary third-party React/CSS from a runtime-uploaded ZIP
 * without a real sandboxed template-rendering layer, which is out of
 * scope for this update — see PROGRESS.md. What's real here is the
 * validation/extraction/security pipeline and the installed-package
 * record; wiring an uploaded theme's own components into the live app is
 * the next step for a future update, not something this one pretends
 * already works (per spec item 43's own instruction).
 */
export async function uploadThemeZipAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);

  const file = formData.get("themeZip") as File | null;
  if (!file || file.size === 0) return "Choose a .zip file first.";
  if (!file.name.toLowerCase().endsWith(".zip")) return "Only .zip files are accepted.";
  if (file.size > 12 * 1024 * 1024) return "File is too large (12MB limit).";

  const existing = await prisma.installedTheme.findMany({ select: { slug: true } });
  const existingSlugs = new Set([...Object.keys(THEMES), ...existing.map((t) => t.slug)]);

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await installZipPackage(buffer, THEMES_DIR, existingSlugs);
  if (!result.ok) return result.error;

  await prisma.installedTheme.create({
    data: {
      slug: result.manifest.slug,
      name: result.manifest.name,
      version: result.manifest.version,
      author: result.manifest.author,
      description: result.manifest.description,
      installedById: user.id,
    },
  });
  await logAudit(user.id, "THEME_ZIP_INSTALLED", "InstalledTheme", result.manifest.slug, { name: result.manifest.name });

  redirect("/admin/themes");
}
