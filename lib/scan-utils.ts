/**
 * Client-safe (no server-only imports) interpretation of "whatever just
 * landed in the search box" — typed text, a USB QR/barcode reader's
 * keystrokes, or the in-app camera scanner's decoded text. A reader (or
 * this app's own QR codes — see lib/qr-code.ts) types the LP document's
 * full URL, not just the bare reference number, so the search box has to
 * recognize both: a direct internal link, resolved immediately with no
 * search step at all, or a bare reference number (or free text), which
 * falls through to the existing substring search.
 */
export type ScannedValue = { type: "internal-path"; path: string } | { type: "text"; value: string };

const INTERNAL_DOC_PATH = /\/(orders|quotations|job-orders)\/([a-zA-Z0-9_-]+)\/?$/;

export function interpretScannedValue(raw: string): ScannedValue {
  const trimmed = raw.trim();
  if (!trimmed) return { type: "text", value: trimmed };

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(INTERNAL_DOC_PATH);
      if (match) return { type: "internal-path", path: `/${match[1]}/${match[2]}` };
    } catch {
      // Not a parseable URL — fall through and treat it as plain text.
    }
  }

  return { type: "text", value: trimmed };
}
