"use server";

import path from "path";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { installZipPackage } from "@/lib/package-installer";

const PLUGINS_DIR = path.join(process.cwd(), "plugins");

/**
 * Admin-only plugin ZIP upload (spec Part F) — same validated
 * upload/extract pipeline as the theme installer (lib/package-installer.ts),
 * targeting /plugins instead of /themes. A newly-installed plugin starts
 * inactive; only an explicit Activate flips it on. This update deliberately
 * builds only the architecture and this state toggle — no plugin's actual
 * code ever runs (spec item 38: "do NOT build the actual payment gateway
 * in this update"), so "active" here is a real, persisted flag with no
 * behavior wired to it yet, honestly represented as such in the UI.
 */
export async function uploadPluginZipAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);

  const file = formData.get("pluginZip") as File | null;
  if (!file || file.size === 0) return "Choose a .zip file first.";
  if (!file.name.toLowerCase().endsWith(".zip")) return "Only .zip files are accepted.";
  if (file.size > 12 * 1024 * 1024) return "File is too large (12MB limit).";

  const existing = await prisma.installedPlugin.findMany({ select: { slug: true } });
  const existingSlugs = new Set(existing.map((p) => p.slug));

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await installZipPackage(buffer, PLUGINS_DIR, existingSlugs);
  if (!result.ok) return result.error;

  await prisma.installedPlugin.create({
    data: {
      slug: result.manifest.slug,
      name: result.manifest.name,
      version: result.manifest.version,
      author: result.manifest.author,
      description: result.manifest.description,
      active: false,
      installedById: user.id,
    },
  });
  await logAudit(user.id, "PLUGIN_ZIP_INSTALLED", "InstalledPlugin", result.manifest.slug, { name: result.manifest.name });

  redirect("/admin/plugins");
}

export async function setPluginActiveAction(id: string, active: boolean) {
  const user = await requireRole(["ADMIN"]);
  const plugin = await prisma.installedPlugin.update({ where: { id }, data: { active } });
  await logAudit(user.id, active ? "PLUGIN_ACTIVATED" : "PLUGIN_DEACTIVATED", "InstalledPlugin", plugin.slug, {});
  redirect("/admin/plugins");
}
