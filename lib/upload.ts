import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/** Saves an uploaded File (from a <form> multipart submission) to /public/uploads and returns its public path. */
export async function saveUploadedFile(file: File): Promise<{ filename: string; path: string }> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(file.name) || "";
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, safeName), bytes);
  return { filename: file.name, path: `/uploads/${safeName}` };
}
