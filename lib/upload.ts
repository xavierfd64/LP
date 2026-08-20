import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/**
 * Every caller of `saveUploadedFile` must pick a category. Extensions here
 * are deliberately restricted to formats that can never execute as active
 * content when opened same-origin (no HTML/SVG/JS/executables anywhere) —
 * this is the actual fix for the stored-XSS finding, not the UI hiding
 * dangerous options. SVG is excluded even from "image" on purpose: it can
 * embed <script>, and safely sanitizing SVG is a much bigger undertaking
 * than this app currently needs — nothing here has a genuine requirement
 * for it, so it's restricted rather than "solved."
 */
export type UploadCategory = "image" | "document" | "chat-attachment";

const CATEGORY_EXTENSIONS: Record<UploadCategory, readonly string[]> = {
  image: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".ico"],
  document: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"],
  "chat-attachment": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt"],
};

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/** Real content-sniffing, not just trusting the extension — checks the file's actual magic bytes against what its extension claims to be. `.txt` has no reliable signature to check (any byte sequence is technically valid plain text), which is fine: it can't be turned into executable active content by mislabeling regardless. */
function matchesSignature(ext: string, bytes: Buffer): boolean {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case ".png":
      return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case ".gif":
      return bytes.length >= 6 && (bytes.toString("ascii", 0, 6) === "GIF87a" || bytes.toString("ascii", 0, 6) === "GIF89a");
    case ".webp":
      return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    case ".ico":
      return bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00;
    case ".pdf":
      return bytes.length >= 4 && bytes.toString("ascii", 0, 4) === "%PDF";
    case ".docx":
    case ".xlsx":
      // OOXML formats are ZIP containers — a real .docx/.xlsx always starts with the ZIP local-file-header signature.
      return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
    case ".doc":
    case ".xls":
      // Legacy OLE compound-file formats share this fixed signature.
      return (
        bytes.length >= 8 &&
        bytes[0] === 0xd0 &&
        bytes[1] === 0xcf &&
        bytes[2] === 0x11 &&
        bytes[3] === 0xe0 &&
        bytes[4] === 0xa1 &&
        bytes[5] === 0xb1 &&
        bytes[6] === 0x1a &&
        bytes[7] === 0xe1
      );
    case ".txt":
      return true;
    default:
      return false;
  }
}

/** Thrown for any rejected upload — every caller should catch this specifically and surface `.message` through its own existing error-reporting convention (some `return` a string, some `redirect` with `?error=`). Never let this propagate as an unhandled 500. */
export class UploadRejectedError extends Error {}

/** Saves an uploaded File (from a <form> multipart submission) to /public/uploads and returns its public path. Validates extension against the given category's allow-list AND the file's actual content (magic bytes), not extension alone — and enforces a size cap. The stored filename is always server-generated (timestamp + random suffix + extension), never derived from the client-supplied name, which also keeps this immune to path traversal. */
export async function saveUploadedFile(
  file: File,
  category: UploadCategory,
  opts?: { maxBytes?: number }
): Promise<{ filename: string; path: string }> {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  if (file.size > maxBytes) {
    throw new UploadRejectedError(`That file is too large (${Math.floor(maxBytes / (1024 * 1024))}MB max).`);
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ext || !CATEGORY_EXTENSIONS[category].includes(ext)) {
    throw new UploadRejectedError("That file type isn't supported.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!matchesSignature(ext, bytes)) {
    throw new UploadRejectedError("That file's contents don't match its extension.");
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  await writeFile(path.join(UPLOAD_DIR, safeName), bytes);
  return { filename: file.name, path: `/uploads/${safeName}` };
}
