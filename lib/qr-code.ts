import { toDataURL } from "qrcode";

/**
 * Same "app base URL" convention lib/notifications.ts's absoluteLink
 * already uses — NEXTAUTH_URL is the one place the real public origin is
 * configured, so a QR code printed today keeps resolving correctly if the
 * deployment's domain changes, without hunting down every embed site.
 */
export function absoluteAppUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return path.startsWith("http") ? path : `${base}${path}`;
}

/**
 * Server-side QR PNG (data URI) for a document's own detail page — the QR
 * is a direct link, not a second identity or a bespoke lookup token (LP
 * System Update Part 2: "the QR Code is simply another way to locate the
 * transaction"). Scanning it opens the real internal page, which already
 * enforces its own existing auth/ownership guard — the QR itself carries
 * no elevated access, so it can never become a permissions bypass.
 * Generated at render time in the (already-async) Server Component print
 * pages, so the printed/PDF output never depends on client JS running.
 */
export async function documentQrDataUrl(path: string): Promise<string> {
  const url = absoluteAppUrl(path);
  return toDataURL(url, { width: 132, margin: 1 });
}
