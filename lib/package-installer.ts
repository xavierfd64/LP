import AdmZip from "adm-zip";
import path from "path";
import fs from "fs/promises";

export type PackageManifest = {
  name: string;
  slug: string;
  version: string;
  author?: string;
  description?: string;
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_ENTRIES = 2000;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

/** manifest.json's own required shape — real schema validation, not just "is it JSON" (spec item 39: "malicious manifests"). */
export function validateManifestShape(raw: unknown): { ok: true; manifest: PackageManifest } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "manifest.json must be a JSON object." };
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.name !== "string" || !m.name.trim()) return { ok: false, error: 'manifest.json is missing a valid "name".' };
  if (typeof m.slug !== "string" || !SLUG_RE.test(m.slug)) {
    return { ok: false, error: 'manifest.json\'s "slug" must be lowercase letters, numbers, and hyphens only (max 64 chars).' };
  }
  if (typeof m.version !== "string" || !m.version.trim()) return { ok: false, error: 'manifest.json is missing a valid "version".' };
  return {
    ok: true,
    manifest: {
      name: m.name.trim().slice(0, 200),
      slug: m.slug,
      version: m.version.trim().slice(0, 40),
      author: typeof m.author === "string" ? m.author.trim().slice(0, 200) : undefined,
      description: typeof m.description === "string" ? m.description.trim().slice(0, 1000) : undefined,
    },
  };
}

/** Rejects an absolute path, a Windows drive-letter path, or anything whose normalized form starts with ".." — the actual "zip slip" defense, applied to every single entry before it's ever written to disk. */
function isSafeRelativeEntryPath(entryName: string): boolean {
  if (!entryName || entryName.startsWith("/") || entryName.startsWith("\\") || /^[a-zA-Z]:/.test(entryName)) return false;
  const normalized = path.normalize(entryName);
  if (normalized.startsWith("..") || normalized.includes(`..${path.sep}`) || path.isAbsolute(normalized)) return false;
  return true;
}

export type InstallResult = { ok: true; manifest: PackageManifest } | { ok: false; error: string };

/**
 * Validates and extracts a ZIP package (theme or plugin — same security
 * requirements either way) into `<baseDir>/<manifest.slug>/`. Every file is
 * written manually after independently re-validating its resolved
 * destination path stays inside baseDir/slug — deliberately not relying
 * solely on the zip library's own extraction method, so this check is
 * directly auditable rather than delegated silently to a dependency.
 *
 * Note (Render deployment): baseDir is written to this container's local
 * filesystem, which — like every other upload in this app (Business
 * Settings logo, chat attachments) — does not persist across a redeploy on
 * this host. See PROGRESS.md for the honest accounting of this limitation.
 */
export async function installZipPackage(
  zipBuffer: Buffer,
  baseDir: string,
  existingSlugs: Set<string>
): Promise<InstallResult> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    return { ok: false, error: "That file isn't a valid ZIP archive." };
  }

  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (entries.length === 0) return { ok: false, error: "The ZIP archive is empty." };
  if (entries.length > MAX_ENTRIES) return { ok: false, error: "The ZIP archive has too many files." };

  const totalUncompressed = entries.reduce((sum, e) => sum + e.header.size, 0);
  if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
    return { ok: false, error: "The ZIP archive is too large (50MB uncompressed limit)." };
  }

  for (const entry of entries) {
    if (!isSafeRelativeEntryPath(entry.entryName)) {
      return { ok: false, error: `Rejected: "${entry.entryName}" is an unsafe path (path traversal blocked).` };
    }
  }

  const manifestEntry = entries.find((e) => e.entryName === "manifest.json");
  if (!manifestEntry) return { ok: false, error: "The ZIP archive must contain manifest.json at its root." };

  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(manifestEntry.getData().toString("utf-8"));
  } catch {
    return { ok: false, error: "manifest.json is not valid JSON." };
  }

  const validated = validateManifestShape(manifestRaw);
  if (!validated.ok) return validated;
  const { manifest } = validated;

  if (existingSlugs.has(manifest.slug)) {
    return { ok: false, error: `A package with slug "${manifest.slug}" is already installed.` };
  }

  // Never allow a slug that would resolve outside baseDir either — the
  // SLUG_RE character class already excludes "/" and "." sequences, but
  // this keeps the same explicit-check discipline as the per-entry test
  // above rather than trusting the regex alone.
  const destRoot = path.resolve(baseDir, manifest.slug);
  if (!destRoot.startsWith(path.resolve(baseDir) + path.sep)) {
    return { ok: false, error: "Invalid package slug." };
  }

  await fs.mkdir(destRoot, { recursive: true });
  for (const entry of entries) {
    const destPath = path.resolve(destRoot, entry.entryName);
    if (!destPath.startsWith(destRoot + path.sep) && destPath !== destRoot) {
      return { ok: false, error: `Rejected: "${entry.entryName}" resolves outside the install directory.` };
    }
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, entry.getData());
  }

  return { ok: true, manifest };
}
